import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  XCircle,
  Info,
  Cpu,
  HardDrive,
  Database,
  ShieldCheck,
  ExternalLink,
  Briefcase,
  Building2,
  MapPin,
  Calendar,
  Globe,
  Tag,
  AlertCircle,
  ShoppingBag,
  Train,
  Clock,
  ArrowUpDown,
  Filter,
  Check,
  TrendingDown,
  Zap,
  SlidersHorizontal
} from 'lucide-react';

export default function ResultsPanel({ results, status }) {
  if (!results && status !== 'completed') return null;

  const intent = results?.intent || (results?.extractedProducts?.length ? 'demo_store_laptop' : 'general');
  const recommendation = results?.recommendation;

  const isTravelSearch = intent === 'travel_comparison' || intent === 'train_search';
  const isJobSearch = intent === 'job_search';
  const isProductSearch = intent === 'product_comparison' || intent === 'product_search';
  const isWebSearch = intent === 'web_search';
  const isDemoStore = intent === 'demo_store_laptop';
  const isUnsupported = intent === 'unsupported';

  // State for sorting & filters
  const [jobFilterTab, setJobFilterTab] = useState('verified'); // 'verified' | 'all' | 'uncertain'
  const [travelSort, setTravelSort] = useState('best_value'); // 'best_value' | 'cheapest' | 'fastest'
  const [productSort, setProductSort] = useState('cheapest'); // 'cheapest' | 'ram'

  const jobResults = results?.jobResults || [];
  const uncertainJobs = results?.uncertainMatches || [];
  const productResults = results?.productResults || [];
  const webResults = results?.webResults || [];
  const products = results?.extractedProducts || [];
  const passingProducts = results?.passingProducts || [];
  const travelTrains = results?.trains || results?.travelResults?.trains || [];
  const travelRec = results?.recommendationDetails || results?.travelResults?.recommendation;
  const verification = results?.verification;

  // Sorted Trains
  const sortedTrains = [...travelTrains].sort((a, b) => {
    if (travelSort === 'cheapest') return (a.cheapestFare || 99999) - (b.cheapestFare || 99999);
    if (travelSort === 'fastest') return (a.durationMinutes || 99999) - (b.durationMinutes || 99999);
    // best_value: Tejas/Sampoorna Kranti first
    return (b.rating || 0) - (a.rating || 0);
  });

  // Sorted & Filtered Jobs
  const displayJobs = jobFilterTab === 'verified'
    ? jobResults.filter(j => j.verified)
    : (jobFilterTab === 'uncertain' ? uncertainJobs : [...jobResults, ...uncertainJobs]);

  // Sorted Products
  const sortedProducts = [...productResults].sort((a, b) => {
    const parsePrice = (p) => parseFloat(String(p?.price || '').replace(/[^\d.]/g, '')) || 999999;
    const parseRam = (p) => parseInt(String(p?.ram || p?.title || '').match(/(\d+)\s*(?:gb|gigs?)/i)?.[1] || '0', 10);
    if (productSort === 'ram') return parseRam(b) - parseRam(a);
    return parsePrice(a) - parsePrice(b);
  });

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderRadius: 10 }}>
      {/* ── Header Bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc' }}>
            <Award size={22} color="#fbbf24" />
            <span>
              {isTravelSearch && 'Travel & Train Comparison Matrix'}
              {isJobSearch && 'Targeted Job Discovery & Relevance Validation'}
              {isProductSearch && 'Real Product Comparison & Merchant Pricing'}
              {isWebSearch && 'Live Web Research & Grounded Evidence'}
              {isDemoStore && 'Demo Store Verified Laptop Catalog (Sandbox)'}
              {isUnsupported && 'Task Limitation & Clarification Guidance'}
              {!isTravelSearch && !isJobSearch && !isProductSearch && !isWebSearch && !isDemoStore && !isUnsupported && 'Task Results & Findings'}
            </span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {results?.dataSource ? `Data Source: ${results.dataSource}` : 'Verified execution results'}
          </p>
        </div>

        {/* Truthful Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {results?.searchProviderLabel && (
            <span style={{
              background: results.isLiveSearch ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: results.isLiveSearch ? '#34d399' : '#fbbf24',
              border: `1px solid ${results.isLiveSearch ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.25rem 0.65rem',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <Globe size={13} />
              {results.searchProviderLabel}
            </span>
          )}

          {isJobSearch && (
            <span style={{
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.25rem 0.65rem',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <ShieldCheck size={14} />
              {jobResults.filter(j => j.verified).length} Role-Verified Match{jobResults.filter(j => j.verified).length !== 1 ? 'es' : ''}
            </span>
          )}

          {isTravelSearch && (
            <span style={{
              background: 'rgba(251, 191, 36, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.25rem 0.65rem',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <Train size={14} />
              {sortedTrains.length} Train Schedules Compared
            </span>
          )}
        </div>
      </div>

      {/* ── Recommendation Callout Banner ── */}
      {recommendation && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(30, 41, 59, 0.4))',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: 8,
          padding: '1.1rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Zap size={14} />
            <span>Agent Synthesis & Recommendation</span>
          </div>
          <p style={{ fontSize: '0.925rem', color: '#f8fafc', lineHeight: 1.55 }}>
            {recommendation}
          </p>
        </div>
      )}

      {/* ── 1. TRAVEL & TRAIN COMPARISON VIEW ── */}
      {isTravelSearch && (
        <div>
          {/* Quick Recommendation Highlights */}
          {travelRec && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Best Value Train */}
              {travelRec.bestOverall && (
                <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 8, padding: '1rem' }}>
                  <div style={{ fontSize: '0.725rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    🏆 Best Overall Match
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '0.25rem' }}>
                    {travelRec.bestOverall.name}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45, marginBottom: '0.75rem' }}>
                    {travelRec.bestOverall.reason}
                  </p>
                  <a
                    href={travelRec.bestOverall.bookingUrl || results?.officialBookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <span>Check Live Availability</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}

              {/* Cheapest Fare */}
              {travelRec.cheapestTrain && (
                <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: 8, padding: '1rem' }}>
                  <div style={{ fontSize: '0.725rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    💰 Lowest Fare Option
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '0.25rem' }}>
                    {travelRec.cheapestTrain.name} — <span style={{ color: '#34d399' }}>{travelRec.cheapestTrain.fare}</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45, marginBottom: '0.75rem' }}>
                    Class: {travelRec.cheapestTrain.class} • Duration: {travelRec.cheapestTrain.duration}
                  </p>
                  <a
                    href={travelRec.cheapestTrain.bookingUrl || results?.officialBookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <span>Book on Portal</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}

              {/* Fastest Journey */}
              {travelRec.fastestTrain && (
                <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: 8, padding: '1rem' }}>
                  <div style={{ fontSize: '0.725rem', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    ⚡ Fastest Journey
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '0.25rem' }}>
                    {travelRec.fastestTrain.name} — <span style={{ color: '#fbbf24' }}>{travelRec.fastestTrain.duration}</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45, marginBottom: '0.75rem' }}>
                    Departure: {travelRec.fastestTrain.departure} • Arrival: {travelRec.fastestTrain.arrival}
                  </p>
                  <a
                    href={travelRec.fastestTrain.bookingUrl || results?.officialBookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <span>View Schedule</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Sort Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <SlidersHorizontal size={15} color="#38bdf8" />
              <span>Full Schedule & Fare Comparison Table</span>
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sort by:</span>
              <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 6, padding: '0.15rem' }}>
                <button
                  onClick={() => setTravelSort('best_value')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: 4,
                    background: travelSort === 'best_value' ? '#0284c7' : 'transparent',
                    color: travelSort === 'best_value' ? '#fff' : '#94a3b8',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Best Value
                </button>
                <button
                  onClick={() => setTravelSort('cheapest')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: 4,
                    background: travelSort === 'cheapest' ? '#0284c7' : 'transparent',
                    color: travelSort === 'cheapest' ? '#fff' : '#94a3b8',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Cheapest Fare
                </button>
                <button
                  onClick={() => setTravelSort('fastest')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: 4,
                    background: travelSort === 'fastest' ? '#0284c7' : 'transparent',
                    color: travelSort === 'fastest' ? '#fff' : '#94a3b8',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Fastest
                </button>
              </div>
            </div>
          </div>

          {/* Structured Comparison Table */}
          <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.7)', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Train Name & No.</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Departure / Arrival</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Duration</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Sleeper (SL)</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>3rd AC (3A)</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Booking Partner</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600, textAlign: 'right' }}>Direct Link</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrains.map((t, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: idx % 2 === 0 ? 'rgba(30, 41, 59, 0.25)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Train size={14} color="#38bdf8" />
                        <span>{t.trainName}</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>#{t.trainNumber} • {t.punctualityScore}</span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#cbd5e1' }}>
                      <strong>{t.departureTime}</strong> ({t.originStation}) <br />
                      <span style={{ color: '#94a3b8' }}>to {t.arrivalTime} ({t.destinationStation})</span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#f1f5f9', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Clock size={13} color="#fbbf24" />
                        <span>{t.duration}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#34d399', fontWeight: 700 }}>
                      {t.classes?.find(c => c.code === 'SL')?.fare ? `₹${t.classes.find(c => c.code === 'SL').fare}` : 'N/A'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#38bdf8', fontWeight: 700 }}>
                      {t.classes?.find(c => c.code === '3A')?.fare ? `₹${t.classes.find(c => c.code === '3A').fare}` : 'N/A'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#cbd5e1' }}>
                      <span style={{ background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.725rem' }}>
                        {t.bookingProvider}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <a
                        href={t.bookingUrl || results?.officialBookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#38bdf8',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.775rem',
                          fontWeight: 600,
                        }}
                      >
                        <span>Check Seats</span>
                        <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-dim)',
            background: 'rgba(0,0,0,0.3)',
            padding: '0.65rem 0.9rem',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <Info size={14} color="#94a3b8" />
            <span>
              {results?.disclaimer || 'Fare amounts reflect published Indian Railways base tariff benchmarks. Live seat availability and tatkal booking require user login on official IRCTC.'}
            </span>
          </div>
        </div>
      )}

      {/* ── 2. JOB SEARCH & COMPARISON VIEW ── */}
      {isJobSearch && (
        <div>
          {/* Filter Tabs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setJobFilterTab('verified')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  background: jobFilterTab === 'verified' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.4)',
                  borderColor: jobFilterTab === 'verified' ? '#38bdf8' : 'var(--border-color)',
                  color: jobFilterTab === 'verified' ? '#38bdf8' : '#94a3b8',
                }}
              >
                Verified Relevant Matches ({jobResults.length})
              </button>
              {uncertainJobs.length > 0 && (
                <button
                  onClick={() => setJobFilterTab('uncertain')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid',
                    background: jobFilterTab === 'uncertain' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.4)',
                    borderColor: jobFilterTab === 'uncertain' ? '#f87171' : 'var(--border-color)',
                    color: jobFilterTab === 'uncertain' ? '#f87171' : '#94a3b8',
                  }}
                >
                  Uncertain / Unrelated Roles ({uncertainJobs.length})
                </button>
              )}
            </div>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Target Role: <strong style={{ color: '#e2e8f0' }}>{results?.criteria?.role || 'Requested Role'}</strong>
            </span>
          </div>

          {/* Empty State when no verified jobs match */}
          {displayJobs.length === 0 ? (
            <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <AlertCircle size={28} color="#fbbf24" style={{ margin: '0 auto 0.6rem' }} />
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.4rem' }}>
                No Verified Relevant Matches Found
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 540, margin: '0 auto' }}>
                Netsurf strictly rejects listings that do not match the requested <strong>{results?.criteria?.role}</strong> role. 
                Unrelated engineering or developer listings have been excluded rather than falsely shown as matches.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              {displayJobs.map((job, idx) => {
                const isVerified = Boolean(job.verified);
                return (
                  <div
                    key={idx}
                    style={{
                      background: isVerified ? 'rgba(31, 41, 55, 0.65)' : 'rgba(31, 41, 55, 0.25)',
                      border: isVerified ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 8,
                      padding: '1.1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div>
                      {/* Top Badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                        <span style={{
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#60a5fa',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}>
                          <Globe size={11} />
                          {job.domain || 'job portal'}
                        </span>

                        <span style={{
                          background: isVerified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: isVerified ? '#34d399' : '#fbbf24',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}>
                          {isVerified ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                          {isVerified ? `${job.relevanceScore || 90}% Match` : 'Uncertain Match'}
                        </span>
                      </div>

                      {/* Job Title as Clickable Link */}
                      <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#f9fafb',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#38bdf8'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#f9fafb'}
                        >
                          <span>{job.title}</span>
                          <ExternalLink size={14} color="#38bdf8" />
                        </a>
                      </h4>

                      {/* Company & Details */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        {job.company && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Building2 size={13} color="#94a3b8" />
                            <strong style={{ color: '#e2e8f0' }}>{job.company}</strong>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <MapPin size={13} color="#94a3b8" />
                          <span>{job.location || 'India'}</span>
                          {job.workMode && (
                            <span style={{ background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.4rem', borderRadius: 4, fontSize: '0.7rem' }}>
                              {job.workMode}
                            </span>
                          )}
                        </div>
                        {job.experience && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Briefcase size={13} color="#94a3b8" />
                            <span>{job.experience}</span>
                          </div>
                        )}
                      </div>

                      {/* Snippet */}
                      {job.snippet && (
                        <p style={{ fontSize: '0.785rem', color: '#94a3b8', lineHeight: 1.45, marginBottom: '0.75rem' }}>
                          {job.snippet}
                        </p>
                      )}
                    </div>

                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        fontSize: '0.8rem',
                        padding: '0.45rem 0.75rem',
                        textDecoration: 'none',
                        marginTop: '0.5rem',
                      }}
                    >
                      <span>Apply on {job.domain || 'Portal'}</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 3. PRODUCT COMPARISON VIEW ── */}
      {isProductSearch && (
        <div>
          {/* Sorting Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Laptop size={16} color="#38bdf8" />
              <span>Compared Products & Specifications ({sortedProducts.length} items)</span>
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sort:</span>
              <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 6, padding: '0.15rem' }}>
                <button
                  onClick={() => setProductSort('cheapest')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: 4,
                    background: productSort === 'cheapest' ? '#0284c7' : 'transparent',
                    color: productSort === 'cheapest' ? '#fff' : '#94a3b8',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Lowest Price
                </button>
                <button
                  onClick={() => setProductSort('ram')}
                  style={{
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: 4,
                    background: productSort === 'ram' ? '#0284c7' : 'transparent',
                    color: productSort === 'ram' ? '#fff' : '#94a3b8',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Highest RAM
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            {sortedProducts.map((prod, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(31, 41, 55, 0.5)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '1.1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 600 }}>
                      {prod.merchant || prod.domain}
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#34d399' }}>
                      {prod.price}
                    </span>
                  </div>

                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.5rem' }}>
                    {prod.title}
                  </h4>

                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45, marginBottom: '0.85rem' }}>
                    {prod.snippet}
                  </p>
                </div>

                <a
                  href={prod.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.75rem',
                    textDecoration: 'none',
                  }}
                >
                  <ShoppingBag size={13} />
                  <span>View on {prod.merchant || prod.domain}</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. GENERAL WEB RESEARCH VIEW ── */}
      {isWebSearch && (
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.75rem' }}>
            Retrieved Sources & Evidence ({webResults.length} sources)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {webResults.map((web, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(31, 41, 55, 0.4)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <Globe size={14} color="#60a5fa" />
                  <span style={{ fontSize: '0.75rem', color: '#93c5fd' }}>{web.domain}</span>
                </div>

                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  <a
                    href={web.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#f9fafb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    {web.title}
                    <ExternalLink size={13} color="#38bdf8" />
                  </a>
                </h4>

                <p style={{ fontSize: '0.825rem', color: '#9ca3af', lineHeight: 1.5 }}>
                  {web.snippet}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. DEMO STORE LAPTOP VIEW (Local sandbox) ── */}
      {isDemoStore && (
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.75rem' }}>
            Demo Store Catalog ({products.length} inspected via Playwright)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            {products.map((p, i) => {
              const verificationDetail = verification?.details?.find(d => d.product.name === p.name);
              const isMatch = verificationDetail ? verificationDetail.passed : true;

              return (
                <div
                  key={i}
                  style={{
                    background: isMatch ? 'rgba(31, 41, 55, 0.6)' : 'rgba(31, 41, 55, 0.25)',
                    border: isMatch ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-color)',
                    borderRadius: 8,
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f9fafb' }}>{p.name}</h4>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: isMatch ? '#34d399' : '#9ca3af' }}>
                      {p.price}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Database size={13} color="#94a3b8" />
                      <span>RAM: <strong style={{ color: '#e2e8f0' }}>{p.ram || 'N/A'}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Cpu size={13} color="#94a3b8" />
                      <span>CPU: <strong style={{ color: '#e2e8f0' }}>{p.cpu || 'N/A'}</strong></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-dim)',
            background: 'rgba(0,0,0,0.3)',
            padding: '0.5rem 0.75rem',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <Info size={14} />
            <span>Source: Local synthetic store sandbox on http://localhost:3001. All models and prices are generated test artifacts.</span>
          </div>
        </div>
      )}

      {/* ── 6. UNSUPPORTED TASK VIEW ── */}
      {isUnsupported && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          padding: '1.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fca5a5', fontWeight: 600, marginBottom: '0.5rem' }}>
            <AlertCircle size={18} />
            <span>Task Boundary & Clarification Notice</span>
          </div>
          <p style={{ color: '#d1d5db', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
            {results?.explanation || 'This request does not match supported automation workflows.'}
          </p>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
            Netsurf supports: <strong>Travel Comparison</strong> (e.g. <em>"Cheapest train tickets from Delhi to Patna"</em>), 
            <strong>Job Discovery</strong> (e.g. <em>"Search jobs for Data Analyst for freshers in India"</em>), 
            <strong>Product Comparison</strong> (e.g. <em>"Laptops under ₹50,000 with 16GB RAM"</em>), 
            and <strong>Web Research</strong>.
          </p>
        </div>
      )}

    </div>
  );
}
