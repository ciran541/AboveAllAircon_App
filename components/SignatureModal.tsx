'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface SignatureModalProps {
  isOpen: boolean
  workerName: string
  onClose: () => void
  onSubmit: (signatureData: string) => void
}

export default function SignatureModal({ isOpen, workerName, onClose, onSubmit }: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ w: 340, h: 200 })

  // Resize canvas to fit container
  const updateCanvasSize = useCallback(() => {
    const w = Math.min(window.innerWidth - 64, 400)
    const h = Math.min(200, w * 0.5)
    setCanvasSize({ w, h })
  }, [])

  useEffect(() => {
    if (isOpen) {
      updateCanvasSize()
      window.addEventListener('resize', updateCanvasSize)
      // Prevent body scroll on mobile
      document.body.style.overflow = 'hidden'
      return () => {
        window.removeEventListener('resize', updateCanvasSize)
        document.body.style.overflow = ''
      }
    }
  }, [isOpen, updateCanvasSize])

  // Clear canvas when opened
  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvasSize.w, canvasSize.h)
        setHasDrawn(false)
      }
    }
  }, [isOpen, canvasSize])

  function getPos(e: React.TouchEvent | React.MouseEvent) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    setIsDrawing(true)
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    if (!isDrawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasDrawn(true)
  }

  function endDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    setIsDrawing(false)
  }

  function handleClear() {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvasSize.w, canvasSize.h)
      setHasDrawn(false)
    }
  }

  function handleSubmit() {
    if (!canvasRef.current || !hasDrawn) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onSubmit(dataUrl)
  }

  if (!isOpen) return null

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(17,24,39,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440,
          padding: 24, boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)',
          animation: 'sigFadeIn 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Sign & Acknowledge</h3>
            <p style={{ fontSize: 13, color: '#6b7280' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>{workerName}</span> — Please sign below to acknowledge salary received
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#64748b', flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Canvas area */}
        <div style={{
          position: 'relative', borderRadius: 14, overflow: 'hidden',
          border: '2px dashed #cbd5e1', background: '#fafbfc',
        }}>
          {/* Hint overlay */}
          {!hasDrawn && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', color: '#94a3b8', fontSize: 14, fontWeight: 500, gap: 8,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
              Draw your signature here
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            style={{
              display: 'block', width: '100%', height: canvasSize.h,
              touchAction: 'none', cursor: 'crosshair',
              background: hasDrawn ? '#fff' : 'transparent',
            }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />

          {/* Signature line */}
          <div style={{
            position: 'absolute', bottom: 24, left: 32, right: 32,
            height: 1, background: '#e2e8f0', pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: 8, left: 32,
            fontSize: 9, color: '#cbd5e1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
            pointerEvents: 'none',
          }}>
            Signature
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={handleClear} style={{
            flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #e4e9f0',
            background: '#fff', color: '#64748b', fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Clear
          </button>
          <button onClick={handleSubmit} disabled={!hasDrawn} style={{
            flex: 2, padding: '11px', borderRadius: 10, border: 'none',
            background: hasDrawn ? 'linear-gradient(135deg, #059669, #047857)' : '#e2e8f0',
            color: hasDrawn ? '#fff' : '#94a3b8', fontSize: 13.5, fontWeight: 700,
            cursor: hasDrawn ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: hasDrawn ? '0 2px 8px rgba(5,150,105,0.3)' : 'none',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Submit Signature
          </button>
        </div>
      </div>

      <style>{`
        @keyframes sigFadeIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  )
}
