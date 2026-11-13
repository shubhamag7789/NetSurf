"""
NetSurf Grounded Page Q&A Service (Phase 3)
Builds a grounded, reliable question-answering pipeline on active webpage content:
DOM Content Extraction -> Content Cleaning -> Chunking -> Relevance Retrieval -> Grounded Answer Generation -> Evidence Presentation.
"""

import re
import math
from typing import Dict, List, Any, Optional, Tuple
from pydantic import BaseModel, Field

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

from .config import settings

class QAPageChunk(BaseModel):
    chunk_id: int
    heading: str = ""
    content: str
    token_count: int = 0
    score: float = 0.0

class PageQARequest(BaseModel):
    question: str = Field(..., min_length=2, description="The user's grounded question about the active page")
    page_url: str = Field(..., description="Active webpage URL")
    page_title: str = Field(default="", description="Active webpage title")
    page_text: str = Field(..., min_length=10, description="Cleaned active page text")
    headings: Optional[List[str]] = Field(default_factory=list, description="Key headings on the page")

class PageQAResponse(BaseModel):
    question: str
    answer: str
    found_on_page: bool
    confidence: float
    evidence: List[str] = Field(default_factory=list)
    relevant_chunks: List[Dict[str, Any]] = Field(default_factory=list)
    source_url: str
    source_title: str
    is_external_search: bool = False


def clean_page_text(raw_text: str) -> str:
    """Removes script, navigational noise, repeated symbols and normalizes whitespace."""
    if not raw_text:
        return ""
    # Strip script/style artifact remnants
    text = re.sub(r'<(?:script|style|svg|noscript)[^>]*>.*?</(?:script|style|svg|noscript)>', ' ', raw_text, flags=re.DOTALL | re.IGNORECASE)
    # Strip HTML tags if any remain
    text = re.sub(r'<[^>]+>', ' ', text)
    # Normalize multiple whitespace and newlines
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def chunk_document(text: str, chunk_size_words: int = 220, overlap_words: int = 40) -> List[QAPageChunk]:
    """Splits cleaned webpage content into semantically coherent overlapping chunks."""
    cleaned = clean_page_text(text)
    paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
    
    words_list: List[str] = []
    for p in paragraphs:
        w = p.split()
        if w:
            words_list.extend(w)
            words_list.append("\n\n")

    chunks: List[QAPageChunk] = []
    idx = 0
    i = 0
    step = chunk_size_words - overlap_words
    
    while i < len(words_list):
        chunk_words = words_list[i : i + chunk_size_words]
        chunk_str = " ".join(chunk_words).replace(" \n\n ", "\n\n").strip()
        if len(chunk_str) > 25:
            idx += 1
            chunks.append(QAPageChunk(
                chunk_id=idx,
                content=chunk_str,
                token_count=len(chunk_words)
            ))
        i += step
        if step <= 0:
            break

    if not chunks and cleaned:
        chunks.append(QAPageChunk(chunk_id=1, content=cleaned[:1800], token_count=len(cleaned.split())))

    return chunks


def score_chunk_relevance(question: str, chunk: QAPageChunk) -> float:
    """Computes BM25-style lexical and semantic relevance between question terms and chunk content."""
    q_words = set(re.findall(r'\b\w{3,}\b', question.lower()))
    stopwords = {"what", "when", "where", "which", "who", "whom", "this", "that", "these", "those", "from", "with", "about", "page", "does", "have", "tell", "show"}
    q_terms = [w for w in q_words if w not in stopwords]
    
    if not q_terms:
        q_terms = list(q_words)
    if not q_terms:
        return 0.1

    chunk_lower = chunk.content.lower()
    score = 0.0

    for term in q_terms:
        # Exact word match
        matches = len(re.findall(rf'\b{re.escape(term)}\b', chunk_lower))
        if matches > 0:
            score += 1.0 + (math.log(matches) * 0.5)
        elif term in chunk_lower:
            score += 0.4

    # Phrase match bonus
    if len(q_terms) >= 2:
        phrase = " ".join(q_terms[:3])
        if phrase in chunk_lower:
            score += 3.0

    # Pricing query boost
    if any(k in question.lower() for k in ("price", "cost", "fare", "rate", "fee", "₹", "$", "inr")):
        if re.search(r'(?:₹|rs\.?|inr|\$|€|£)\s*[\d,]+', chunk_lower):
            score += 2.5

    # Policy / cancellation boost
    if any(k in question.lower() for k in ("cancellation", "policy", "refund", "terms", "rules")):
        if any(k in chunk_lower for k in ("cancel", "refund", "policy", "charges", "hours before")):
            score += 2.5

    # Qualification / Job requirements boost
    if any(k in question.lower() for k in ("qualification", "requirement", "skills", "experience", "eligibility")):
        if any(k in chunk_lower for k in ("bachelor", "degree", "experience", "years", "proficient", "knowledge")):
            score += 2.5

    return round(score, 3)


def retrieve_relevant_chunks(question: str, chunks: List[QAPageChunk], top_k: int = 4) -> List[QAPageChunk]:
    """Scores all chunks and retrieves the top-k most relevant chunks."""
    scored: List[Tuple[float, QAPageChunk]] = []
    for c in chunks:
        s = score_chunk_relevance(question, c)
        c.score = s
        scored.append((s, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = [c for s, c in scored[:top_k] if s > 0.3]
    # Fallback to top 2 if no chunk met strict threshold but chunks exist
    if not top and chunks:
        top = [scored[0][1]]
    return top


def extract_evidence_snippets(question: str, text: str, max_snippets: int = 3) -> List[str]:
    """Extracts factual verbatim sentences from the page matching question keywords."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    q_words = set(re.findall(r'\b\w{3,}\b', question.lower()))
    stopwords = {"what", "when", "where", "which", "who", "whom", "this", "that", "these", "those", "from", "with", "about", "page", "does", "have", "tell", "show"}
    q_terms = [w for w in q_words if w not in stopwords]

    scored_sentences: List[Tuple[int, str]] = []
    for s in sentences:
        s_clean = s.strip()
        if len(s_clean) < 15 or len(s_clean) > 350:
            continue
        s_lower = s_clean.lower()
        score = sum(1 for t in q_terms if t in s_lower)
        if score > 0:
            scored_sentences.append((score, s_clean))

    scored_sentences.sort(key=lambda x: x[0], reverse=True)
    return [s for _, s in scored_sentences[:max_snippets]]


def answer_page_question(req: PageQARequest) -> PageQAResponse:
    """
    Executes the full grounded question-answering pipeline on the active page:
    Extract -> Clean -> Chunk -> Retrieve -> Generate -> Evidence.
    """
    cleaned = clean_page_text(req.page_text)
    chunks = chunk_document(cleaned)
    top_chunks = retrieve_relevant_chunks(req.question, chunks, top_k=4)

    # 1. Extractive grounding checks
    combined_context = "\n---\n".join([c.content for c in top_chunks])
    evidence_snippets = extract_evidence_snippets(req.question, combined_context, max_snippets=3)

    # Determine if question can be answered from page
    top_score = top_chunks[0].score if top_chunks else 0.0
    has_relevant_content = top_score >= 1.0 or bool(evidence_snippets)

    # 2. LLM Grounded Answer Generation
    client = None
    if genai and settings.GEMINI_API_KEY:
        try:
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
        except Exception:
            client = None

    if client and has_relevant_content:
        prompt = f"""You are a grounded web assistant analyzing the active webpage: "{req.page_title}" ({req.page_url}).
Answer the user's question STRICTLY and FACTUALLY using ONLY the provided page content chunks below.

Rules:
1. Ground every claim on the provided text. Never fabricate or hallucinate information.
2. If the answer cannot be found in the provided page chunks, state clearly: "This information is not mentioned on the active webpage."
3. Distinguish confirmed facts from inferences.
4. Include specific numbers, dates, terms, or policies exactly as written on the page.
5. Do not suggest searching Google; the user is asking specifically about this webpage.

Page Content Chunks:
{combined_context}

Question: {req.question}

Respond with:
- A concise, direct factual answer.
- Key highlights or bullet points if applicable."""

        try:
            resp = client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=450
                )
            )
            raw_answer = (resp.text or "").strip()
            if "not mentioned on the active webpage" in raw_answer.lower():
                return PageQAResponse(
                    question=req.question,
                    answer="This information could not be found on the active webpage.",
                    found_on_page=False,
                    confidence=0.3,
                    evidence=[],
                    relevant_chunks=[{"id": c.chunk_id, "score": c.score} for c in top_chunks],
                    source_url=req.page_url,
                    source_title=req.page_title
                )

            return PageQAResponse(
                question=req.question,
                answer=raw_answer,
                found_on_page=True,
                confidence=min(0.98, 0.70 + (top_score * 0.05)),
                evidence=evidence_snippets,
                relevant_chunks=[{"id": c.chunk_id, "score": c.score, "snippet": c.content[:140]} for c in top_chunks],
                source_url=req.page_url,
                source_title=req.page_title
            )
        except Exception as e:
            # Fall back to deterministic grounded synthesis
            pass

    # 3. Deterministic Grounded Synthesis Fallback (when offline or model unavailable)
    if not has_relevant_content or not evidence_snippets:
        return PageQAResponse(
            question=req.question,
            answer=f"The active webpage does not appear to contain information answering: \"{req.question}\".",
            found_on_page=False,
            confidence=0.2,
            evidence=[],
            relevant_chunks=[{"id": c.chunk_id, "score": c.score} for c in top_chunks],
            source_url=req.page_url,
            source_title=req.page_title
        )

    # Synthesize answer directly from highest-scoring evidence snippets
    lead_sentence = evidence_snippets[0]
    extra_context = "\n".join([f"• {s}" for s in evidence_snippets[1:]])
    deterministic_answer = f"{lead_sentence}\n\n{extra_context}" if extra_context else lead_sentence

    return PageQAResponse(
        question=req.question,
        answer=deterministic_answer.strip(),
        found_on_page=True,
        confidence=min(0.92, 0.65 + (top_score * 0.05)),
        evidence=evidence_snippets,
        relevant_chunks=[{"id": c.chunk_id, "score": c.score, "snippet": c.content[:140]} for c in top_chunks],
        source_url=req.page_url,
        source_title=req.page_title
    )
