'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { generateFlashcards } from '@/app/actions/generateFlashcards';
import type { User } from '@supabase/supabase-js';

// Generate unique ID
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12,19 5,12 12,5"/>
    </svg>
  ),
  Upload: () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17,8 12,3 7,8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  File: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>
  ),
  Sparkles: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  ),
  Loader: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
  Check: () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="9,12 12,15 16,10"/>
    </svg>
  ),
  X: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
};

type Step = 'upload' | 'processing' | 'naming' | 'complete';

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('upload');
  
  // File state
  const [file, setFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState<string>('');
  const [extracting, setExtracting] = useState(false);
  
  // Generation state
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  
  // Deck state
  const [deckTitle, setDeckTitle] = useState('');
  const [generatedCards, setGeneratedCards] = useState<Array<{front: string; back: string}>>([]);
  const [createdDeckId, setCreatedDeckId] = useState<string | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }
      
      setUser(user);
      setLoading(false);
    };

    checkUser();
  }, [router]);

  const extractTextFromPDF = async (pdfFile: File): Promise<string> => {
    // Use pdf-parse on the server side via API route
    const formData = new FormData();
    formData.append('file', pdfFile);
    
    const response = await fetch('/api/extract-pdf', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Falha ao extrair texto do PDF');
    }
    
    const data = await response.json();
    return data.text;
  };

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile.type.includes('pdf')) {
      alert('Por favor, selecione um arquivo PDF.');
      return;
    }
    
    // Max 50MB para suportar PDFs grandes
    if (selectedFile.size > 50 * 1024 * 1024) {
      alert('O arquivo deve ter no máximo 50MB.');
      return;
    }
    
    setFile(selectedFile);
    setExtracting(true);
    
    try {
      const text = await extractTextFromPDF(selectedFile);
      setPdfText(text);
      
      // Auto-generate title from filename
      const nameWithoutExt = selectedFile.name.replace('.pdf', '').replace(/_/g, ' ').replace(/-/g, ' ');
      setDeckTitle(nameWithoutExt);
      
      setExtracting(false);
    } catch (error) {
      console.error('Error extracting PDF:', error);
      alert('Erro ao ler o PDF. Tente outro arquivo.');
      setFile(null);
      setExtracting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleGenerate = async () => {
    if (!pdfText || !user) return;
    
    setStep('processing');
    setGenerating(true);
    setProgress(10);
    setStatusMessage('Analisando o conteúdo do PDF...');
    
    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + Math.random() * 15, 85));
      }, 1000);
      
      setProgress(30);
      setStatusMessage('Gerando flashcards com IA...');
      
      // Call server action
      const cards = await generateFlashcards(pdfText);
      
      clearInterval(progressInterval);
      setProgress(100);
      setStatusMessage('Flashcards gerados com sucesso!');
      setGeneratedCards(cards);
      
      // Short delay before showing naming step
      setTimeout(() => {
        setStep('naming');
        setGenerating(false);
      }, 500);
      
    } catch (error) {
      console.error('Error generating cards:', error);
      alert('Erro ao gerar flashcards. Tente novamente.');
      setStep('upload');
      setGenerating(false);
    }
  };

  const handleSaveDeck = async () => {
    if (!deckTitle.trim() || !user || generatedCards.length === 0) return;
    
    setGenerating(true);
    setStatusMessage('Salvando deck...');
    
    try {
      const supabase = createClient();
      const now = Date.now();
      const deckId = generateId();
      
      // Create deck
      const { error: deckError } = await supabase
        .from('decks')
        .insert({
          id: deckId,
          user_id: user.id,
          title: deckTitle.trim(),
          description: `Gerado automaticamente a partir de: ${file?.name}`,
          created_at: now,
          updated_at: now,
        });
      
      if (deckError) throw deckError;
      
      // Create cards
      const cardsToInsert = generatedCards.map(card => ({
        id: generateId(),
        deck_id: deckId,
        front: card.front,
        back: card.back,
        step: 0,
        created_at: now,
        updated_at: now,
      }));
      
      const { error: cardsError } = await supabase
        .from('cards')
        .insert(cardsToInsert);
      
      if (cardsError) throw cardsError;
      
      setCreatedDeckId(deckId);
      setStep('complete');
      
    } catch (error) {
      console.error('Error saving deck:', error);
      alert('Erro ao salvar deck. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
      }}>
        <Icons.Loader />
        <style jsx global>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'var(--bg-raised)',
      }}>
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--bg-muted)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          <Icons.ArrowLeft />
        </Link>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Criar Deck com IA</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Faça upload de um PDF para gerar flashcards automaticamente
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
        
        {/* Step: Upload */}
        {step === 'upload' && (
          <>
            {/* Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border)',
                borderRadius: 20,
                padding: 48,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: file ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                borderColor: file ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
              />
              
              {extracting ? (
                <div style={{ color: 'var(--accent)' }}>
                  <Icons.Loader />
                  <p style={{ marginTop: 16 }}>Lendo PDF...</p>
                </div>
              ) : file ? (
                <>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: 'rgba(99, 102, 241, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    color: 'var(--accent)',
                  }}>
                    <Icons.File />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{file.name}</p>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {pdfText.split(' ').length} palavras
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setPdfText('');
                    }}
                    style={{
                      marginTop: 16,
                      padding: '8px 16px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-muted)',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Trocar arquivo
                  </button>
                </>
              ) : (
                <>
                  <div style={{
                    width: 80,
                    height: 80,
                    borderRadius: 20,
                    background: 'var(--bg-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                    color: 'var(--text-muted)',
                  }}>
                    <Icons.Upload />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                    Arraste um PDF aqui
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
                    ou clique para selecionar
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Máximo 50MB • Apenas PDF
                  </p>
                </>
              )}
            </div>

            {/* Deck Title Input */}
            {file && pdfText && (
              <div style={{ marginTop: 24 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                  Nome do Deck
                </label>
                <input
                  type="text"
                  value={deckTitle}
                  onChange={(e) => setDeckTitle(e.target.value)}
                  placeholder="Ex: Direito Civil - Contratos"
                  style={{
                    width: '100%',
                    height: 48,
                    padding: '0 16px',
                    fontSize: 15,
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!file || !pdfText || !deckTitle.trim()}
              style={{
                width: '100%',
                marginTop: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '18px 32px',
                background: file && pdfText && deckTitle.trim()
                  ? 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)'
                  : 'var(--bg-muted)',
                border: 'none',
                borderRadius: 14,
                color: file && pdfText && deckTitle.trim() ? 'white' : 'var(--text-muted)',
                fontSize: 17,
                fontWeight: 600,
                cursor: file && pdfText && deckTitle.trim() ? 'pointer' : 'not-allowed',
                boxShadow: file && pdfText && deckTitle.trim() ? '0 4px 20px rgba(99, 102, 241, 0.3)' : 'none',
              }}
            >
              <Icons.Sparkles />
              Gerar Deck com IA
            </button>
          </>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 32px',
              color: 'var(--accent)',
            }}>
              <Icons.Sparkles />
            </div>
            
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              Gerando flashcards...
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
              {statusMessage}
            </p>
            
            {/* Progress Bar */}
            <div style={{
              width: '100%',
              maxWidth: 320,
              height: 8,
              background: 'var(--bg-muted)',
              borderRadius: 4,
              margin: '0 auto',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #6366F1, #7C3AED)',
                transition: 'width 0.3s ease',
              }} />
            </div>
            
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 16 }}>
              Isso pode levar até 1 minuto
            </p>
          </div>
        )}

        {/* Step: Naming / Preview */}
        {step === 'naming' && (
          <>
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 16,
              padding: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginBottom: 24,
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(34, 197, 94, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--success)',
              }}>
                <Icons.Sparkles />
              </div>
              <div>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>
                  {generatedCards.length} flashcards gerados!
                </p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Revise o nome do deck e salve
                </p>
              </div>
            </div>
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                Nome do Deck
              </label>
              <input
                type="text"
                value={deckTitle}
                onChange={(e) => setDeckTitle(e.target.value)}
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 16px',
                  fontSize: 15,
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
            
            {/* Preview Cards */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
                Preview dos Cards ({generatedCards.length})
              </label>
              <div style={{
                maxHeight: 300,
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                {generatedCards.slice(0, 5).map((card, index) => (
                  <div key={index} style={{
                    background: 'var(--bg-muted)',
                    borderRadius: 12,
                    padding: 16,
                  }}>
                    <p style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 8, fontWeight: 500 }}>
                      Pergunta {index + 1}
                    </p>
                    <p style={{ fontSize: 14, marginBottom: 8 }}>{card.front}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{card.back}</p>
                  </div>
                ))}
                {generatedCards.length > 5 && (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>
                    +{generatedCards.length - 5} cards...
                  </p>
                )}
              </div>
            </div>
            
            <button
              onClick={handleSaveDeck}
              disabled={generating || !deckTitle.trim()}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '18px 32px',
                background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                border: 'none',
                borderRadius: 14,
                color: 'white',
                fontSize: 17,
                fontWeight: 600,
                cursor: generating ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? <Icons.Loader /> : 'Salvar Deck'}
            </button>
          </>
        )}

        {/* Step: Complete */}
        {step === 'complete' && (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 32px',
              color: 'var(--success)',
            }}>
              <Icons.Check />
            </div>
            
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              Deck criado com sucesso! 🎉
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
              {generatedCards.length} flashcards prontos para estudar
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320, margin: '0 auto' }}>
              <Link href={`/estudar/${createdDeckId}`} style={{ textDecoration: 'none' }}>
                <button style={{
                  width: '100%',
                  padding: '18px 32px',
                  background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                  border: 'none',
                  borderRadius: 14,
                  color: 'white',
                  fontSize: 17,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
                }}>
                  Começar a Estudar
                </button>
              </Link>
              
              <Link href="/dashboard" style={{ textDecoration: 'none' }}>
                <button style={{
                  width: '100%',
                  padding: '18px 32px',
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  color: 'var(--text-secondary)',
                  fontSize: 17,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}>
                  Voltar ao Dashboard
                </button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
