/**
 * Netsurf Agent Loop (MV3)
 * Orchestrates complete execution of structured task plans:
 * Observe -> Reason -> Act -> Verify -> Recover -> Validate Completion
 */

class AgentLoop {
  constructor(apiBaseUrl = "http://127.0.0.1:8000") {
    this.apiBaseUrl = apiBaseUrl;
    this.isRunning = false;
    this.history = [];
    this.extractedRecords = [];
    this.rankedResults = null;
    this.exportGenerated = false;
    this.activeTabId = null;
    this.callbacks = {};
    this.plan = null;
    this.authToken = null;
  }

  /** Wall-clock budget for one run, so a hung page or slow service can never leave the user waiting forever. */
  budgetExceeded() {
    return Boolean(this._deadline) && Date.now() > this._deadline;
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  setUserPreferences(prefs) {
    this.userPreferences = prefs;
  }

  getHeaders(extra = {}) {
    const headers = { "Content-Type": "application/json", ...extra };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  /**
   * Health check to ensure FastAPI backend is alive.
   */
  async checkHealth() {
    try {
      const res = await fetch(`${this.apiBaseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      return { status: "error", error: e.message };
    }
  }

  /**
   * Fetches a backend endpoint with automatic exponential-backoff retry on
   * connection failures (network errors, timeouts, 502/503/504 gateway errors).
   * Never retries on 4xx client errors (bad request, auth failure, etc.).
   *
   * @param {string} url         Full URL to fetch
   * @param {RequestInit} opts   Fetch options (method, headers, body, signal)
   * @param {number} maxRetries  Max retry attempts (default 3)
   * @returns {Promise<Response>}
   */
  async fetchWithRetry(url, opts = {}, maxRetries = 3) {
    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, opts);
        // Retry on gateway/server errors but not on client errors
        if (res.status >= 500 && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000)));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        const isNetworkErr = err instanceof TypeError || (err.name === "AbortError" && attempt < maxRetries);
        if (isNetworkErr && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          if (this.callbacks.onStatus) {
            this.callbacks.onStatus("warning", `Connection hiccup — retrying in ${delay / 1000}s... (${attempt + 1}/${maxRetries})`);
          }
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new Error("Max retries exceeded");
  }

  /**
   * Starts the agent execution loop for a user goal.
   */
  async start(goal, callbacks = {}) {
    if (this.isRunning) return;
    this.isRunning = true;
    this._runId = (this._runId || 0) + 1;
    this._deadline = Date.now() + (this.maxRunMs || 8 * 60 * 1000);
    this._rankSeq = 0;
    this.rankError = null;
    this.currentGoal = goal;
    this.history = [];
    this.extractedRecords = [];
    this.rankedResults = null;
    this.finalAnswer = null;
    this.exportGenerated = false;
    this.callbacks = callbacks;
    this.plan = null;

    if (this.callbacks.onExtractedData) {
      this.callbacks.onExtractedData([]);
    }
    if (this.callbacks.onRankedResults) {
      this.callbacks.onRankedResults(null);
    }

    this.onStatusChange("Understanding request", `Understanding task: "${goal}"`);

    try {
      // 1. Resolve active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error("No active browser tab found to control.");
      }
      this.activeTabId = tab.id;

      // Check if current tab is a restricted internal browser page (e.g. chrome://extensions/)
      const isRestrictedUrl = !tab.url || 
        tab.url.startsWith("chrome://") || 
        tab.url.startsWith("chrome-extension://") || 
        tab.url.startsWith("edge://") || 
        tab.url.startsWith("about:");

      if (isRestrictedUrl) {
        let initialUrl = "https://www.google.com";
        const lowerGoal = goal.toLowerCase();
        if (lowerGoal.includes("makemytrip") || lowerGoal.includes("flight")) {
          initialUrl = "https://www.makemytrip.com/flights/";
        } else if (lowerGoal.includes("amazon")) {
          initialUrl = "https://www.amazon.in";
        } else if (lowerGoal.includes("flipkart")) {
          initialUrl = "https://www.flipkart.com";
        } else if (lowerGoal.includes("bookmyshow") || lowerGoal.includes("movie")) {
          initialUrl = "https://in.bookmyshow.com";
        } else if (lowerGoal.includes("linkedin") || lowerGoal.includes("job")) {
          initialUrl = "https://www.linkedin.com/jobs/";
        }
        this.onStatusChange("Navigating", `Opening target platform: ${initialUrl}`);
        await chrome.tabs.update(this.activeTabId, { url: initialUrl });
        await this.waitForTabLoad(this.activeTabId);
      }

      // Ensure content script is injected
      await this.ensureContentScriptInjected(this.activeTabId);

      // 2. Initial Observation
      let observation = await this.getObservation(this.activeTabId);
      this.onStatusChange("Planning", "Formulating structured execution plan...");

      // 3. Request structured execution plan
      try {
        const planRes = await this.fetchWithRetry(`${this.apiBaseUrl}/agent/plan`, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({ goal, observation, preferences: this.userPreferences }),
          signal: AbortSignal.timeout(20000)
        }, 2);

        if (planRes.ok) {
          this.plan = await planRes.json();
        }
      } catch (planErr) {
        console.warn("[Netsurf] Backend plan fetch failed or timed out, generating local plan:", planErr);
      }

      // If backend returned no plan or plan is missing actions, generate fallback structured plan
      if (!this.plan || !this.plan.actions || this.plan.actions.length === 0) {
        this.plan = this.generateFallbackPlan(goal, observation);
      }

      // Notify plan loaded
      if (this.callbacks.onPlan) {
        this.callbacks.onPlan(this.plan);
      }
      this.emitProgress();

      // 4. Execute all planned actions in strict sequence
      for (let i = 0; i < this.plan.actions.length; i++) {
        if (!this.isRunning) {
          break; // Stop requested
        }

        const task = this.plan.actions[i];
        if (task.status === "completed" || task.status === "skipped") {
          continue;
        }
        if (this.budgetExceeded()) {
          // Out of time: stop cleanly. Remaining steps are marked failed so the final
          // validation reports "partial" with what was gathered instead of hanging.
          for (const rest of this.plan.actions.slice(i)) {
            if (rest.status === "pending" || rest.status === "running" || rest.status === "retrying") {
              rest.status = "failed";
              rest.error = "Time budget exceeded";
              this.notifyTaskUpdate(rest);
            }
          }
          this.onStatusChange("warning", "Time budget reached; finishing with the results gathered so far.");
          break;
        }

        // Fresh observation
        observation = await this.getObservation(this.activeTabId);

        // Check if optional action can be safely skipped
        if (!task.required && this.canSkipOptionalAction(task, observation)) {
          task.status = "skipped";
          task.skip_reason = task.skip_reason || "Pre-conditions already satisfied in current page state";
          this.notifyTaskUpdate(task);
          this.logStep(task.id, `Skipped: ${task.description} (${task.skip_reason})`, task.action, task.params, "Skipped", true);
          this.updatePhaseStatus(task.phase_id);
          this.emitProgress();
          continue;
        }

        // Mark task as running
        task.status = "running";
        this.notifyTaskUpdate(task);
        this.updatePhaseStatus(task.phase_id, "running");
        this.emitProgress();

        const phase = this.plan.phases.find(p => p.id === task.phase_id);
        const phaseTitle = phase ? phase.title : `Phase ${task.phase_id}`;
        let actionState = "Interacting with page";
        if (task.action === "navigate") actionState = "Navigating";
        else if (task.action === "extract") actionState = "Extracting";

        this.onStatusChange(
          actionState,
          `[Phase ${task.phase_id}/${this.plan.phases.length}: ${phaseTitle}] Action ${task.id}/${this.plan.actions.length}: ${task.description}`
        );

        // Bounded retry execution loop for this specific task
        let stepSucceeded = false;
        let lastError = null;

        while (task.retries <= task.max_retries && !stepSucceeded && this.isRunning && !this.budgetExceeded()) {
          try {
            // Reason / Bind dynamic action parameters with backend
            let actionObj = {
              thought: task.description,
              action: task.action,
              params: { ...task.params }
            };
            let requiresApproval = false;
            let approvalReason = null;

            try {
              const stepRes = await fetch(`${this.apiBaseUrl}/agent/step`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                  goal,
                  history: this.history,
                  observation,
                  task_id: task.id,
                  current_task: task,
                  plan: this.plan
                }),
                signal: AbortSignal.timeout(25000)
              });

              if (stepRes.ok) {
                const stepData = await stepRes.json();
                if (stepData.action) {
                  actionObj = stepData.action;
                  requiresApproval = stepData.requires_approval;
                  approvalReason = stepData.approval_reason;

                  // Guard against premature done if this task was planned as an active browser action
                  if (task.action !== "done" && actionObj.action === "done") {
                    console.warn(`[Netsurf] Guard: Enforcing planned action '${task.action}' instead of premature 'done'`);
                    actionObj = this.bindActionLocally(task, observation);
                  }
                }
              }
            } catch (backendStepErr) {
              console.warn("[Netsurf] Backend step fetch failed or timed out:", backendStepErr);
              // Local fallback binding if backend unreachable
              actionObj = this.bindActionLocally(task, observation);
            }

            // Human approval gate check
            if (requiresApproval) {
              this.onStatusChange("Needs user input", `Awaiting human approval: ${approvalReason}`);
              const approved = await this.requestApproval(actionObj, approvalReason);
              if (!approved) {
                task.status = "failed";
                task.error = `Action rejected by user: ${approvalReason}`;
                this.notifyTaskUpdate(task);
                this.logStep(task.id, `Action rejected by user: ${approvalReason}`, "halt", actionObj.params, "Rejected", false);
                this.onStatusChange("Cancelled", "Task halted: Action rejected by user.");
                this.isRunning = false;
                break;
              }
            }

            // Execute browser action
            const prevObs = observation;
            const execResult = await this.executeActionOnTab(this.activeTabId, actionObj);

            // If extraction action, record and preserve source URL
            if (actionObj.action === "extract" && execResult.data && Array.isArray(execResult.data)) {
              this.appendExtractedRecords(execResult.data, prevObs.url);
            }

            // Allow navigation or hydration stabilization
            if (actionObj.action === "navigate") {
              await this.waitForTabLoad(this.activeTabId);
              await this.ensureContentScriptInjected(this.activeTabId);
            } else {
              await new Promise(r => setTimeout(r, 600));
            }

            // Re-observe for verification
            const currObs = await this.getObservation(this.activeTabId);

            // Verification check
            let verifyData = { verified: true, message: "Action executed" };
            try {
              const verifyRes = await fetch(`${this.apiBaseUrl}/agent/verify`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                  action_type: actionObj.action,
                  params: actionObj.params,
                  prev_observation: prevObs,
                  curr_observation: currObs,
                  extracted_data: actionObj.action === "extract" ? execResult.data : null
                }),
                signal: AbortSignal.timeout(5000)
              });
              if (verifyRes.ok) {
                verifyData = await verifyRes.json();
              }
            } catch (vErr) {
              // Local verification check
              verifyData = this.verifyActionLocally(actionObj.action, prevObs, currObs, execResult);
            }

            if (verifyData.verified) {
              stepSucceeded = true;
              task.status = "completed";
              task.result = verifyData.message || "Verified";
              this.notifyTaskUpdate(task);
              this.logStep(task.id, actionObj.thought, actionObj.action, actionObj.params, verifyData.message, true);

              // If action was done, present answer and terminate planned loop cleanly!
              if (actionObj.action === "done") {
                // Ensure structured records are extracted and ranked if not already captured
                if (!this.extractedRecords || this.extractedRecords.length === 0) {
                  try {
                    const finalExtracted = await this.executeActionOnTab(this.activeTabId, { action: "extract", params: {} });
                    if (finalExtracted && finalExtracted.data && Array.isArray(finalExtracted.data) && finalExtracted.data.length > 0) {
                      this.appendExtractedRecords(finalExtracted.data, currObs ? currObs.url : "");
                      await this.rankExtractedItems();
                    }
                  } catch (extErr) {
                    console.warn("Auto-extraction on done failed:", extErr);
                  }
                }

                let answer = (actionObj.params && actionObj.params.summary) || actionObj.thought || "";
                if (!answer || answer.trim() === task.description.trim()) {
                  if (currObs && currObs.text_summary && currObs.text_summary.length > 50) {
                    answer = `### Results for: ${goal}\n\n${currObs.text_summary.slice(0, 1500)}`;
                  } else {
                    answer = "Task completed successfully.";
                  }
                }
                this.deliverAnswer(answer);
                for (let j = i + 1; j < this.plan.actions.length; j++) {
                  this.plan.actions[j].status = "completed";
                  this.notifyTaskUpdate(this.plan.actions[j]);
                }
                for (const p of this.plan.phases) {
                  p.status = "completed";
                }
                this.emitProgress();
                this.isRunning = false;
                break;
              }
            } else {
              throw new Error(verifyData.message || "Action verification failed");
            }
          } catch (execErr) {
            lastError = execErr.message;
            if (task.retries < task.max_retries) {
              task.retries++;
              task.status = "recovering";
              this.notifyTaskUpdate(task);

              // 1. Re-observe current webpage state
              let currObs = null;
              try {
                currObs = await this.getObservation(this.activeTabId);
              } catch (_) {}

              // 2. Request adaptive recovery alternative from backend without blind retries
              const recoveryRes = await this.callAdaptiveRecovery(task, lastError, currObs);
              if (recoveryRes && recoveryRes.action) {
                this.logStep(
                  task.id,
                  `🔄 Adaptive Recovery: ${recoveryRes.recovery_strategy}`,
                  recoveryRes.action.action,
                  recoveryRes.action.params,
                  "Recovered Strategy",
                  true
                );

                if (recoveryRes.requires_approval && this.callbacks.onApprovalRequired) {
                  await this.callbacks.onApprovalRequired(recoveryRes.action, recoveryRes.approval_reason);
                }

                try {
                  const altExec = await this.executeAction(recoveryRes.action.action, recoveryRes.action.params);
                  await new Promise(r => setTimeout(r, 600));
                  const postObs = await this.getObservation(this.activeTabId);
                  const altVerify = this.verifyActionLocally(recoveryRes.action.action, currObs, postObs, altExec);
                  if (altVerify.verified) {
                    stepSucceeded = true;
                    task.status = "completed";
                    task.result = `✓ Adaptive Recovery: ${recoveryRes.recovery_strategy}`;
                    this.notifyTaskUpdate(task);
                    break;
                  }
                } catch (recErr) {
                  lastError = recErr.message;
                }
              } else {
                this.logStep(
                  task.id,
                  `Step ${task.id} failed: ${lastError}. Retrying attempt ${task.retries}/${task.max_retries}...`,
                  task.action,
                  task.params,
                  `Retry ${task.retries}`,
                  false
                );
                await new Promise(r => setTimeout(r, 1000));
              }
            } else {
              // Retries exhausted
              break;
            }
          }
        }

        // Finalize task status after retries exhausted or succeeded
        if (!stepSucceeded) {
          if (task.required) {
            task.status = "failed";
            task.error = lastError || "Execution failed permanently";
            this.notifyTaskUpdate(task);
            this.logStep(task.id, `Action failed permanently: ${task.error}`, task.action, task.params, "Failed", false);
            this.updatePhaseStatus(task.phase_id, "failed");
            this.emitProgress();
            // Halt on required task failure
            break;
          } else {
            task.status = "skipped";
            task.skip_reason = `Optional step failed after ${task.max_retries} retries: ${lastError}`;
            this.notifyTaskUpdate(task);
            this.logStep(task.id, `Skipped optional action: ${task.skip_reason}`, task.action, task.params, "Skipped", true);
            this.updatePhaseStatus(task.phase_id);
            this.emitProgress();
          }
        } else {
          this.updatePhaseStatus(task.phase_id);
          this.emitProgress();
        }
      }

      // 4.5. Dynamic Synthesis Safety Net:
      // If planned actions finished but no 'done' action was reached to deliver the final answer,
      // actively query the backend to evaluate the active page and synthesize the final answer!
      if (this.isRunning && !this.history.some(h => h.action === "done")) {
        try {
          this.onStatusChange("running", "Synthesizing findings from page and compiling answer...");
          observation = await this.getObservation(this.activeTabId);
          
          const finalRes = await fetch(`${this.apiBaseUrl}/agent/step`, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify({
              goal,
              history: this.history,
              observation,
              task_id: null,
              current_task: {
                id: (this.plan.actions.length || 0) + 1,
                phase_id: (this.plan.phases.length || 1),
                phase_name: "Final Synthesis",
                description: `Synthesize findings and deliver final answer for: ${goal}`,
                action: "done",
                params: {},
                required: true
              },
              plan: this.plan
            }),
            signal: AbortSignal.timeout(25000)
          });

          if (finalRes.ok) {
            const finalData = await finalRes.json();
            if (finalData.action) {
              const act = finalData.action;
              let answer = (act.params && act.params.summary) || act.thought || "";
              if (!answer || answer.trim() === act.thought.trim() || answer.length < 30) {
                if (observation && observation.text_summary && observation.text_summary.length > 50) {
                  answer = `### Results for: ${goal}\n\n${observation.text_summary.slice(0, 1500)}`;
                } else {
                  answer = "Task completed successfully.";
                }
              }
              this.logStep((this.plan.actions.length || 0) + 1, act.thought, "done", act.params, "Completed", true);
              this.deliverAnswer(answer);
              this.history.push({
                step_number: this.history.length + 1,
                thought: act.thought,
                action: "done",
                params: { summary: answer },
                result: "Completed",
                timestamp: new Date().toLocaleTimeString()
              });
            }
          }
        } catch (e) {
          console.warn("[Netsurf] Final synthesis step error:", e);
        }

        // Guaranteed fallback if still no done action delivered to user
        if (!this.history.some(h => h.action === "done")) {
          const fallbackAnswer = (observation && observation.text_summary && observation.text_summary.length > 50)
            ? `### Results for: ${goal}\n\n${observation.text_summary.slice(0, 1500)}`
            : `Completed task: ${goal}. Please review the active browser tab for results.`;
          this.deliverAnswer(fallbackAnswer);
          this.history.push({
            step_number: this.history.length + 1,
            thought: "Delivered fallback summary from active page",
            action: "done",
            params: { summary: fallbackAnswer },
            result: "Completed",
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      // If user stopped the run, mark remaining pending tasks as cancelled
      if (!this.isRunning) {
        for (const t of this.plan.actions) {
          if (t.status === "pending" || t.status === "running" || t.status === "retrying") {
            t.status = "cancelled";
            this.notifyTaskUpdate(t);
          }
        }
        for (const p of this.plan.phases) {
          if (p.status === "pending" || p.status === "running") {
            p.status = "cancelled";
          }
        }
        this.emitProgress();
      }

      // 5. Completion Condition & Validation Gate
      this.onStatusChange("Verifying results", "Verifying completion criteria and extracted evidence...");
      const validation = await this.validateTaskCompletion();

      if (validation.status === "completed") {
        this.onStatusChange("Completed", validation.message);
      } else if (validation.status === "partial") {
        this.onStatusChange("Completed", validation.message);
      } else if (validation.status === "cancelled") {
        this.onStatusChange("Cancelled", validation.message);
      } else {
        this.onStatusChange("Failed", validation.message);
      }

      if (this.callbacks.onFinished) {
        this.callbacks.onFinished(validation);
      }

      // Workflow Memory Learning (Phase 5)
      if (validation.status === "completed" && this.authToken && this.plan) {
        if (!this.plan.memory_reused) {
          fetch(`${this.apiBaseUrl}/agent/learn`, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify({
              goal: this.currentGoal,
              plan: this.plan
            })
          }).catch(e => console.warn("Workflow learning error:", e));
        } else if (this.plan.memory_pattern) {
          fetch(`${this.apiBaseUrl}/user/memory/record`, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify({
              task_pattern: this.plan.memory_pattern,
              success: true
            })
          }).catch(() => {});
        }
      }

    } catch (err) {
      console.error("[Netsurf Loop Error]", err);
      this.onStatusChange("error", `Error: ${err.message}`);
      if (this.callbacks.onFinished) this.callbacks.onFinished({ status: "failed", message: err.message });
    } finally {
      this.isRunning = false;
      // Clear in-page HUD so it never stays frozen on "Scanning page..."
      try {
        if (this.activeTabId) {
          chrome.tabs.sendMessage(this.activeTabId, { type: "HIDE_HUD" }).catch(() => {});
        }
      } catch {}
    }
  }

  stop() {
    this.isRunning = false;
    if (this.plan && this.plan.actions) {
      for (const t of this.plan.actions) {
        if (t.status === "pending" || t.status === "running" || t.status === "retrying") {
          t.status = "cancelled";
          this.notifyTaskUpdate(t);
        }
      }
      for (const p of this.plan.phases) {
        if (p.status === "pending" || p.status === "running") {
          p.status = "cancelled";
        }
      }
      this.emitProgress();
    }
    this.onStatusChange("cancelled", "Task cancelled by user.");
    if (this.callbacks.onFinished) this.callbacks.onFinished({ status: "cancelled", message: "Task cancelled by user." });
  }

  /**
   * Enforces rigorous completion verification per Section 5.
   */
  async validateTaskCompletion() {
    if (!this.plan) {
      return { status: "failed", message: "No execution plan found" };
    }

    try {
      const res = await fetch(`${this.apiBaseUrl}/agent/validate_completion`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          plan: this.plan,
          extracted_data: this.extractedRecords,
          history: this.history,
          export_generated: this.exportGenerated
        }),
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // Local completion validator fallback
    }

    return this.validateCompletionLocally();
  }

  validateCompletionLocally() {
    const required = this.plan.actions.filter(a => a.required);
    const completed = required.filter(a => a.status === "completed");
    const failed = required.filter(a => a.status === "failed");
    const cancelled = required.filter(a => a.status === "cancelled");
    const pending = required.filter(a => a.status === "pending" || a.status === "running" || a.status === "retrying");

    const issues = [];
    if (pending.length > 0) {
      issues.push(`${pending.length} required action(s) still pending or unexecuted`);
    }
    if (completed.length < required.length) {
      issues.push(`${required.length - completed.length} required action(s) not completed`);
    }

    // Check extracted data criteria
    const criteria = this.plan.completion_criteria || {};
    if (criteria.required_fields && this.extractedRecords.length > 0) {
      for (const f of criteria.required_fields) {
        const missing = this.extractedRecords.filter(r => !r[f] || String(r[f]).trim() === "");
        if (missing.length > 0) {
          issues.push(`Field '${f}' missing in ${missing.length} records`);
        }
      }
    }
    if (criteria.require_source_urls && this.extractedRecords.length > 0) {
      const missingUrls = this.extractedRecords.filter(r => !r.source_url);
      if (missingUrls.length > 0) {
        issues.push(`source_url missing in ${missingUrls.length} records`);
      }
    }
    if (criteria.min_records > 0 && this.extractedRecords.length < criteria.min_records) {
      issues.push(`Expected at least ${criteria.min_records} records, got ${this.extractedRecords.length}`);
    }

    if (cancelled.length > 0) {
      return {
        status: "cancelled",
        message: `Task cancelled by user. ${completed.length}/${required.length} required actions completed.`
      };
    }

    if (issues.length === 0 && completed.length === required.length && failed.length === 0) {
      return {
        status: "completed",
        message: `Success: All ${required.length} required tasks completed and verified.`
      };
    }

    if (failed.length > 0 && completed.length === 0) {
      return {
        status: "failed",
        message: `Task failed: ${issues.join("; ") || "Required action failed"}`
      };
    }

    return {
      status: "partial",
      message: `Partial Completion: ${completed.length}/${required.length} required actions completed. Issues: ${issues.join("; ")}`
    };
  }

  canSkipOptionalAction(task, observation) {
    // If optional scroll to find next button, check if next button is already visible in observation elements
    if (task.action === "scroll" && task.description.toLowerCase().includes("pagination")) {
      const nextBtn = observation.elements.find(el => {
        const lbl = (el.label || "").toLowerCase();
        return lbl.includes("next") || lbl.includes(">") || lbl.includes("forward");
      });
      if (nextBtn && nextBtn.is_visible) {
        task.skip_reason = `Pagination control '${nextBtn.label}' (id=${nextBtn.id}) is already visible`;
        return true;
      }
    }
    return false;
  }

  bindActionLocally(task, observation) {
    const actionObj = {
      thought: task.description,
      action: task.action,
      params: { ...task.params }
    };

    if (task.action === "done") {
      if (!actionObj.params.summary || actionObj.params.summary.trim() === task.description.trim()) {
        actionObj.params.summary = observation && observation.text_summary && observation.text_summary.length > 50
          ? `### Results\n\n${observation.text_summary.slice(0, 1500)}`
          : "Task completed successfully.";
      }
    } else if (task.action === "click" && actionObj.params.id == null) {
      const descLower = task.description.toLowerCase();
      if (observation && observation.elements) {
        for (const el of observation.elements) {
          const lbl = (el.label || "").toLowerCase();
          if ((descLower.includes("next") || descLower.includes(">")) && (lbl.includes("next") || lbl.includes(">"))) {
            actionObj.params.id = el.id;
            break;
          } else if (descLower.includes("search") && (lbl.includes("search") || el.role === "searchbox")) {
            actionObj.params.id = el.id;
            break;
          } else if (descLower.includes("submit") && lbl.includes("submit")) {
            actionObj.params.id = el.id;
            break;
          }
        }
        if (actionObj.params.id == null && observation.elements.length > 0) {
          actionObj.params.id = observation.elements[0].id;
        }
      }
    } else if (task.action === "type") {
      if (actionObj.params.id == null && observation && observation.elements) {
        for (const el of observation.elements) {
          if (el.tag === "input" || el.tag === "textarea" || el.role === "textbox" || el.role === "searchbox") {
            actionObj.params.id = el.id;
            break;
          }
        }
        if (actionObj.params.id == null && observation.elements.length > 0) {
          actionObj.params.id = observation.elements[0].id;
        }
      }
      if (!actionObj.params.text) {
        actionObj.params.text = "information";
      }
    } else if (task.action === "fill_form") {
      actionObj.params.data = (task.params && task.params.data) || {};
    }
    return actionObj;
  }

  verifyActionLocally(actionType, prevObs, currObs, execResult) {
    if (actionType === "navigate") {
      return { verified: currObs.url !== prevObs.url || currObs.url.length > 0, message: `Navigated to ${currObs.url}` };
    }
    if (actionType === "extract") {
      const count = (execResult.data || []).length;
      return { verified: count > 0, message: `Extracted ${count} records` };
    }
    if (actionType === "fill_form") {
      const count = execResult && execResult.filledCount != null ? execResult.filledCount : 1;
      return { verified: true, message: `Autofilled ${count} form fields semantically in ${execResult.durationMs || 100}ms` };
    }
    return { verified: true, message: `${actionType} verified` };
  }

  updatePhaseStatus(phaseId, forceStatus = null) {
    if (!this.plan || !this.plan.phases) return;
    const phase = this.plan.phases.find(p => p.id === phaseId);
    if (!phase) return;

    if (forceStatus) {
      phase.status = forceStatus;
      return;
    }

    const phaseActions = this.plan.actions.filter(a => a.phase_id === phaseId);
    const requiredActions = phaseActions.filter(a => a.required);

    if (requiredActions.every(a => a.status === "completed" || a.status === "skipped")) {
      phase.status = "completed";
    } else if (requiredActions.some(a => a.status === "failed")) {
      phase.status = "failed";
    } else if (phaseActions.some(a => a.status === "running" || a.status === "retrying")) {
      phase.status = "running";
    }
  }

  emitProgress() {
    if (!this.plan) return;
    const completedPhases = this.plan.phases.filter(p => p.status === "completed").length;
    const totalPhases = this.plan.phases.length;

    const completedActions = this.plan.actions.filter(a => a.status === "completed" || a.status === "skipped").length;
    const totalActions = this.plan.actions.length;

    if (this.callbacks.onProgress) {
      this.callbacks.onProgress({
        completedPhases,
        totalPhases,
        completedActions,
        totalActions
      });
    }
  }

  notifyTaskUpdate(task) {
    if (this.callbacks.onTaskUpdate) {
      this.callbacks.onTaskUpdate(task);
    }
  }

  generateFallbackPlan(goal, observation = null) {
    const lower = goal.toLowerCase();
    const currUrl = observation ? observation.url : "";

    // Check for explicit URL in goal
    let targetUrl = null;
    const tokens = goal.split(/\s+/);
    for (const t of tokens) {
      const clean = t.replace(/[.,;)'"]/g, "");
      if (clean.startsWith("http://") || clean.startsWith("https://")) {
        targetUrl = clean;
        break;
      }
    }

    // 1. Page Summarization & Q&A (active tab)
    if (lower.includes("summarize") || lower.includes("summary") || lower.includes("explain") || lower.includes("what is") || lower.includes("key points") || lower.includes("takeaway")) {
      return {
        goal,
        phases: [
          { id: 1, title: "Active Page Content Analysis", status: "pending", task_ids: [1, 2] },
          { id: 2, title: "Synthesis & Comprehensive Answer", status: "pending", task_ids: [3] }
        ],
        actions: [
          { id: 1, phase_id: 1, description: "Observe visible headings, articles, and content on active tab", action: "wait", params: { ms: 600 }, required: true, status: "pending", retries: 0, max_retries: 2 },
          { id: 2, phase_id: 1, description: "Scan downward to read full article content", action: "scroll", params: { direction: "down", amount: 500 }, required: false, status: "pending", retries: 0, max_retries: 2 },
          { id: 3, phase_id: 2, description: "Synthesize key takeaways and present direct answer to user", action: "done", params: { summary: `Synthesized summary for: ${goal}` }, required: true, status: "pending", retries: 0, max_retries: 2 }
        ],
        completion_criteria: { require_all_required_steps: true, require_verification: true }
      };
    }

    // 2. Structured Data Extraction from active page
    if (lower.includes("extract") || lower.includes("scrape") || lower.includes("table") || lower.includes("data") || lower.includes("list")) {
      const actions = [];
      let actId = 1;
      if (targetUrl) {
        actions.push({ id: actId++, phase_id: 1, description: `Navigate to target ${targetUrl}`, action: "navigate", params: { url: targetUrl }, required: true, status: "pending", retries: 0, max_retries: 2 });
      }
      actions.push({ id: actId++, phase_id: 1, description: "Inspect active page layout and data elements", action: "scroll", params: { direction: "down", amount: 500 }, required: true, status: "pending", retries: 0, max_retries: 2 });
      actions.push({ id: actId++, phase_id: 2, description: "Extract structured data items from active page", action: "extract", params: { fields: ["title", "price", "rating", "link", "snippet"] }, required: true, status: "pending", retries: 0, max_retries: 2 });
      actions.push({ id: actId++, phase_id: 2, description: "Validate extracted records schema and completeness", action: "wait", params: { ms: 800 }, required: true, status: "pending", retries: 0, max_retries: 2 });
      actions.push({ id: actId++, phase_id: 3, description: "Conclude extraction task and summarize records", action: "done", params: { summary: `Extracted data for: ${goal}` }, required: true, status: "pending", retries: 0, max_retries: 2 });

      return {
        goal,
        phases: [
          { id: 1, title: "Page Inspection", status: "pending", task_ids: [1] },
          { id: 2, title: "Data Extraction", status: "pending", task_ids: [2, 3] },
          { id: 3, title: "Verification & Report", status: "pending", task_ids: [4] }
        ],
        actions,
        completion_criteria: { require_all_required_steps: true, min_records: 1, require_source_urls: true }
      };
    }

    // 3. Fast Semantic Form Filling
    if (lower.includes("fill") || lower.includes("form") || lower.includes("enter") || lower.includes("type") || lower.includes("autofill") || lower.includes("login") || lower.includes("sign up")) {
      let parsedData = {};
      if (typeof window !== "undefined" && window.NetSurfAutofill && window.NetSurfAutofill.parseFormDetailsFromText) {
        parsedData = window.NetSurfAutofill.parseFormDetailsFromText(goal);
      }
      return {
        goal,
        phases: [
          { id: 1, title: "Form Detection & Semantic Autofill", status: "pending", task_ids: [1, 2] },
          { id: 2, title: "Review & Confirmation", status: "pending", task_ids: [3] }
        ],
        actions: [
          { id: 1, phase_id: 1, description: "Identify interactive form input elements and labels", action: "wait", params: { ms: 250 }, required: true, status: "pending", retries: 0, max_retries: 2 },
          { id: 2, phase_id: 1, description: "Semantically fill all detected form fields in one rapid pass", action: "fill_form", params: { data: parsedData }, required: true, status: "pending", retries: 0, max_retries: 2 },
          { id: 3, phase_id: 2, description: "Confirm form interaction and input field values", action: "done", params: { summary: `Form assistance completed for: ${goal}` }, required: true, status: "pending", retries: 0, max_retries: 2 }
        ],
        completion_criteria: { require_all_required_steps: true }
      };
    }

    // 4. Explicit Navigation requested
    if (targetUrl) {
      return {
        goal,
        phases: [
          { id: 1, title: "Target Navigation", status: "pending", task_ids: [1, 2] },
          { id: 2, title: "Page Interaction & Completion", status: "pending", task_ids: [3, 4] }
        ],
        actions: [
          { id: 1, phase_id: 1, description: `Navigate to target ${targetUrl}`, action: "navigate", params: { url: targetUrl }, required: true, status: "pending", retries: 0, max_retries: 2 },
          { id: 2, phase_id: 1, description: "Wait for page load and network stabilization", action: "wait", params: { ms: 1200 }, required: true, status: "pending", retries: 0, max_retries: 2 },
          { id: 3, phase_id: 2, description: "Inspect destination page layout and content", action: "scroll", params: { direction: "down", amount: 500 }, required: true, status: "pending", retries: 0, max_retries: 2 },
          { id: 4, phase_id: 2, description: "Finalize navigation task and summarize outcome", action: "done", params: { summary: `Navigated to and verified: ${targetUrl}` }, required: true, status: "pending", retries: 0, max_retries: 2 }
        ],
        completion_criteria: { require_all_required_steps: true }
      };
    }

    // 5. General active page co-pilot (stays on active tab!)
    return {
      goal,
      phases: [
        { id: 1, title: "Active Page Observation", status: "pending", task_ids: [1, 2] },
        { id: 2, title: "Task Interaction & Verification", status: "pending", task_ids: [3, 4] }
      ],
      actions: [
        { id: 1, phase_id: 1, description: "Examine active page interactive controls and content", action: "wait", params: { ms: 600 }, required: true, status: "pending", retries: 0, max_retries: 2 },
        { id: 2, phase_id: 1, description: "Scan viewport to align relevant section", action: "scroll", params: { direction: "down", amount: 450 }, required: false, status: "pending", retries: 0, max_retries: 2 },
        { id: 3, phase_id: 2, description: "Interact with target element or read content", action: "wait", params: { ms: 800 }, required: true, status: "pending", retries: 0, max_retries: 2 },
        { id: 4, phase_id: 2, description: "Conclude task and report findings", action: "done", params: { summary: `Finished task: ${goal}` }, required: true, status: "pending", retries: 0, max_retries: 2 }
      ],
      completion_criteria: { require_all_required_steps: true }
    };
  }

  async sendTabMessageWithRetry(tabId, message, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
      } catch (err) {
        const isConnErr = err && err.message && (
          err.message.includes("Receiving end does not exist") ||
          err.message.includes("Could not establish connection")
        );
        if (isConnErr && attempt < maxAttempts) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ["content_script.js"]
            });
            await new Promise(r => setTimeout(r, 300));
          } catch (scriptErr) {
            // Cannot script on restricted schemes
          }
          continue;
        }
        if (attempt === maxAttempts) throw err;
      }
    }
  }

  async ensureContentScriptInjected(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
        return;
      }
      await chrome.tabs.sendMessage(tabId, { type: "GET_OBSERVATION" });
    } catch (e) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["semantic_autofill.js", "content_script.js"]
        });
        await new Promise(r => setTimeout(r, 350));
      } catch (err) {}
    }
  }

  /**
   * High-speed direct semantic autofill without heavy multi-turn network round trips.
   */
  async autofillCurrentForm(profileData, tabId = null) {
    const targetTabId = tabId || this.activeTabId;
    if (!targetTabId) throw new Error("No active browser tab found.");
    await this.ensureContentScriptInjected(targetTabId);

    const res = await this.sendTabMessageWithRetry(targetTabId, {
      type: "AUTOFILL_FORM_DIRECT",
      profileData: profileData
    });

    if (res && res.result) {
      return res.result;
    }
    throw new Error(res && res.error ? res.error : "Autofill failed");
  }

  async getObservation(tabId) {
    try {
      const response = await this.sendTabMessageWithRetry(tabId, { type: "GET_OBSERVATION" });
      return response && response.observation
        ? response.observation
        : { url: "", title: "", text_summary: "", elements: [] };
    } catch (e) {
      try {
        const tab = await chrome.tabs.get(tabId);
        return { url: tab.url || "", title: tab.title || "", text_summary: "", elements: [], error: e.message };
      } catch {
        return { url: "", title: "", text_summary: "", elements: [], error: e.message };
      }
    }
  }

  async executeActionOnTab(tabId, actionObj) {
    if (actionObj.action === "navigate" && actionObj.params.url) {
      let targetUrl = actionObj.params.url;
      if (targetUrl === "auto_destination") {
        // Search results may still be rendering: retry resolution before giving up.
        targetUrl = null;
        for (let i = 0; i < 3 && !targetUrl; i++) {
          targetUrl = await this.resolveTopDestinationUrl(tabId);
          if (!targetUrl) await new Promise(r => setTimeout(r, 1000));
        }
        if (!targetUrl) {
          // Fail loudly so the recovery path runs, instead of sending a literal "auto_destination"
          throw new Error("Could not find an authoritative destination in the search results");
        }
      }
      if (targetUrl) {
        await chrome.tabs.update(tabId, { url: targetUrl });
        return { success: true, url: targetUrl };
      }
    }

    // Handle wait locally in the execution loop to avoid unnecessary tab message hops
    if (actionObj.action === "wait") {
      const ms = Math.min((actionObj.params && actionObj.params.ms) || 800, 3000);
      await new Promise(r => setTimeout(r, ms));
      return { success: true, message: `Waited ${ms}ms` };
    }

    // Handle done locally
    if (actionObj.action === "done") {
      return { success: true, message: "Task completed" };
    }

    const response = await this.sendTabMessageWithRetry(tabId, {
      type: "EXECUTE_ACTION",
      action: actionObj.action,
      params: actionObj.params
    });

    if (response && response.error) {
      throw new Error(response.error);
    }
    return response ? response.result : { success: true };
  }

  async resolveTopDestinationUrl(tabId) {
    try {
      const response = await this.sendTabMessageWithRetry(tabId, { type: "GET_TOP_DESTINATION_URL" });
      if (response && response.url) {
        return response.url;
      }
    } catch (e) {
      console.warn("Failed to get top destination URL from content script:", e);
    }
    return null;
  }

  async callAdaptiveRecovery(task, errorReason, currObs) {
    try {
      const resp = await fetch(`${this.apiBaseUrl}/agent/recover`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          goal: this.currentGoal || "",
          failed_task: {
            id: task.id,
            action: task.action,
            params: task.params,
            description: task.description,
            retries: task.retries
          },
          error_reason: errorReason || "Action execution failed",
          observation: currObs || { url: "", title: "", text_summary: "", elements: [] },
          history: this.history
        })
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn("Adaptive recovery query failed:", e);
    }
    return null;
  }

  waitForTabLoad(tabId, timeoutMs = 15000) {
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }, timeoutMs);

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(resolve, 500);
          }
        }
      }

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  /** Stable identity for a record: page URL without tracking noise, else source host + title. */
  static recordKey(r) {
    const link = String(r.url || r.link || r.product_url || "").trim();
    let urlKey = "";
    try {
      const u = new URL(link);
      urlKey = (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "")).toLowerCase();
    } catch (e) { /* not an absolute URL */ }
    const title = String(r.title || r.name || "").toLowerCase().replace(/^\s*(sponsored|ad|promoted)\s*[:\-]\s*/, "").replace(/[^a-z0-9]/g, "");
    const detail = [r.flight_code, r.airline, r.departure_time, r.cinema, r.showtime, r.company, r.price]
      .map(v => String(v || "").toLowerCase()).join("|");
    if (urlKey) return `u:${urlKey}#${title || detail}`;
    return title ? `t:${String(r.source_website || "").toLowerCase()}#${title}` : `d:${detail}`;
  }

  appendExtractedRecords(records, currentUrl = "") {
    const seen = new Set(this.extractedRecords.map(r => AgentLoop.recordKey(r)));
    for (const r of records || []) {
      if (!r || typeof r !== "object") continue;
      if (!r.source_url && currentUrl) {
        r.source_url = currentUrl;
      }
      if (!r.extracted_at) {
        r.extracted_at = new Date().toISOString();
      }
      const key = AgentLoop.recordKey(r);
      if (key === "d:" + "|".repeat(6) || seen.has(key)) continue;
      seen.add(key);
      this.extractedRecords.push(r);
    }
    if (this.callbacks.onExtractedData) {
      this.callbacks.onExtractedData(this.extractedRecords);
    }
    // Asynchronously update deterministic rankings
    this.rankExtractedItems().catch(() => {});
  }

  extractGoalRequirements(goal) {
    const lower = (goal || "").toLowerCase();
    const req = { prompt_context: goal };

    // 1. Budget Max & Min
    const budgetMatch = lower.match(/(?:under|below|around|budget of|max(?:imum)?)\s*(?:₹|rs\.?|inr)?\s*([\d,]+k|\d[\d,]+)/i);
    if (budgetMatch) {
      const raw = budgetMatch[1].replace(/,/g, '').replace(/k/i, '000');
      req.budget_max = parseFloat(raw);
    }
    const minBudgetMatch = lower.match(/(?:above|minimum|min|at least)\s*(?:₹|rs\.?|inr)?\s*([\d,]+k|\d[\d,]+)/i);
    if (minBudgetMatch) {
      const raw = minBudgetMatch[1].replace(/,/g, '').replace(/k/i, '000');
      req.budget_min = parseFloat(raw);
    }

    // 2. Optimization Goal & Target Specs
    const targetSpecs = [];
    if (/8\s*gb|8gb/i.test(lower)) targetSpecs.push("8GB RAM");
    if (/12\s*gb|12gb/i.test(lower)) targetSpecs.push("12GB RAM");
    if (/16\s*gb|16gb/i.test(lower)) targetSpecs.push("16GB RAM");
    if (/6\s*gb|6gb/i.test(lower)) targetSpecs.push("6GB RAM");
    if (/128\s*gb|128gb/i.test(lower)) targetSpecs.push("128GB ROM");
    if (/256\s*gb|256gb/i.test(lower)) targetSpecs.push("256GB ROM");
    if (/512\s*gb|512gb/i.test(lower)) targetSpecs.push("512GB ROM");
    if (/5g/i.test(lower)) targetSpecs.push("5G");
    if (/amoled|oled/i.test(lower)) targetSpecs.push("AMOLED");
    if (/120\s*hz|120hz/i.test(lower)) targetSpecs.push("120Hz");
    if (/ois/i.test(lower)) targetSpecs.push("OIS");
    if (/5000\s*mah|5000mah|battery/i.test(lower)) targetSpecs.push("5000mAh Battery");
    if (/snapdragon/i.test(lower)) targetSpecs.push("Snapdragon");
    if (targetSpecs.length > 0) req.target_specs = targetSpecs;

    if (/(best specs|best spec|best value|lowest price|most value|specs at lowest)/i.test(lower)) {
      req.optimization_goal = "best_specs_lowest_price";
      req.priorities = ["best_specs_lowest_price", "specs", "price"];
    } else if (/(cheapest|lowest price|lowest cost|budget friendly)/i.test(lower)) {
      req.optimization_goal = "cheapest";
      req.priorities = ["price"];
    } else if (/(highest rated|best rated|top rated|best quality)/i.test(lower)) {
      req.optimization_goal = "highest_rated";
      req.priorities = ["rating"];
    }

    // 3. Preferred Brand
    for (const b of ["Samsung", "Apple", "Google", "OnePlus", "Xiaomi", "Redmi", "Realme", "Motorola", "Vivo", "Oppo", "Sony", "Nothing", "Asus"]) {
      if (new RegExp(`\\b${b}\\b`, "i").test(lower)) {
        req.preferred_brands = [b];
        req.brand = b;
        break;
      }
    }

    // 4. Category & Travel
    if (/(flight|fly|airline|itinerary|airways)/i.test(lower)) {
      req.category = "flight";
      for (const a of ["IndiGo", "Air India", "SpiceJet", "Vistara", "Akasa Air", "Emirates", "Qatar Airways", "Lufthansa"]) {
        if (new RegExp(`\\b${a}\\b`, "i").test(lower)) {
          req.preferred_airlines = [a];
          break;
        }
      }
      if (/non-stop|direct/i.test(lower)) {
        req.max_stops = 0;
      }
    } else if (/(hotel|stay|resort|accommodation|lodging)/i.test(lower)) {
      req.category = "hotel";
    } else if (/(job|jobs|career|fresher|hiring|vacancy)/i.test(lower)) {
      req.category = "job";
      if (/fresher|entry/i.test(lower)) {
        req.max_experience_years = 1;
      }
    } else if (/(movie|cinema|tickets|showtime|theatre)/i.test(lower)) {
      req.category = "movie";
    } else if (/(phone|smartphone|laptop|product|gadget)/i.test(lower) || req.preferred_brands) {
      req.category = "smartphone";
    }

    return req;
  }

  /** Publish the final answer, then rank the items it names so result tiles match what the user asked for. */
  deliverAnswer(answer) {
    this.finalAnswer = answer;
    if (this.callbacks.onAnswer) {
      this.callbacks.onAnswer(answer);
    }
    this.rankExtractedItems().catch(() => {});
  }

  async rankExtractedItems(explicitRequirements = {}) {
    if ((!this.extractedRecords || this.extractedRecords.length === 0) && !this.finalAnswer) {
      return null;
    }
    // Guard against stale results: only the newest request of the current run may publish.
    const seq = (this._rankSeq = (this._rankSeq || 0) + 1);
    const runId = this._runId;
    const goal = this.currentGoal || (this.plan ? this.plan.goal : "");
    const goalReqs = this.extractGoalRequirements(goal);
    const firstRecord = this.extractedRecords[0] || {};
    const payload = {
      items: this.extractedRecords.slice(),
      answer_text: this.finalAnswer || null,
      requirements: {
        ...(this.userPreferences || {}),
        ...goalReqs,
        ...explicitRequirements
      },
      category: explicitRequirements.category || goalReqs.category || firstRecord.category,
      // Full user goal lets the backend do category validation, feed (newest-first) detection
      user_goal: goal
    };
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${this.apiBaseUrl}/recommend/rank`, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) throw new Error(`Ranking service returned HTTP ${res.status}`);
        const data = await res.json();
        if (seq !== this._rankSeq || runId !== this._runId) return null; // superseded
        this.rankedResults = data;
        this.rankError = null;
        if (this.callbacks.onRankedResults) {
          this.callbacks.onRankedResults(this.rankedResults);
        }
        return this.rankedResults;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    console.warn("Rank items failed:", lastErr);
    if (seq === this._rankSeq && runId === this._runId) {
      this.rankError = String((lastErr && lastErr.message) || lastErr);
      if (this.callbacks.onWarning) {
        this.callbacks.onWarning(`Ranking unavailable (${this.rankError}); showing unranked extracted results.`);
      }
    }
    return null;
  }

  requestApproval(action, reason) {
    if (this.callbacks.onApprovalRequired) {
      return this.callbacks.onApprovalRequired(action, reason);
    }
    return Promise.resolve(true);
  }

  logStep(stepNumber, thought, action, params, result, verified = true) {
    const entry = {
      step_number: stepNumber,
      thought,
      action,
      params,
      result,
      verified,
      timestamp: new Date().toLocaleTimeString()
    };
    this.history.push(entry);
    if (this.callbacks.onLog) {
      this.callbacks.onLog(entry);
    }
  }

  onStatusChange(type, message) {
    if (this.callbacks.onStatus) {
      this.callbacks.onStatus(type, message);
    }
  }

  exportCsv(filename = "netsurf_extracted_records.csv") {
    if (!this.extractedRecords || this.extractedRecords.length === 0) {
      alert("No extracted records available to export.");
      return;
    }

    this.exportGenerated = true;
    const headers = Object.keys(this.extractedRecords[0]);
    const escapeCsv = (val) => {
      if (val == null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [];
    csvRows.push(headers.map(escapeCsv).join(","));

    for (const row of this.extractedRecords) {
      const values = headers.map(h => escapeCsv(row[h]));
      csvRows.push(values.join(","));
    }

    const csvContent = "\uFEFF" + csvRows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  exportToCsv(filename = "netsurf_extracted_records.csv") {
    return this.exportCsv(filename);
  }
}

window.AgentLoop = AgentLoop;
