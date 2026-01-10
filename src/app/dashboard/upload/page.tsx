'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
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
};

type Step = 'upload' | 'processing' | 'complete';

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
  
  // Processing state
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState(0);

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

  // Get file extension
  const getFileExtension = (filename: string): string => {
    return filename.split('.').pop()?.toLowerCase() || 'pdf';
  };

  // Get content type for file
  const getContentType = (ext: string): string => {
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    return types[ext] || 'application/octet-stream';
  };

  // Upload document to Supabase Storage
  const uploadToStorage = async (docFile: File, userId: string): Promise<{ sourceId: string; storagePath: string; fileType: string }> => {
    const supabase = createClient();
    const sourceId = generateId();
    const ext = getFileExtension(docFile.name);
    const storagePath = `${userId}/${sourceId}.${ext}`;
    
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(storagePath, docFile, {
        contentType: getContentType(ext),
        upsert: false,
      });
    
    if (uploadError) {
      throw new Error(`Erro no upload: ${uploadError.message}`);
    }
    
    return { sourceId, storagePath, fileType: ext };
  };

  // Create source record in database
  const createSourceRecord = async (
    sourceId: string, 
    userId: string, 
    filename: string, 
    storagePath: string,
    fileType: string = 'pdf'
  ): Promise<void> => {
    const supabase = createClient();
    const now = Date.now();
    
    const { error } = await supabase
      .from('sources')
      .insert({
        id: sourceId,
        user_id: userId,
        filename,
        storage_path: storagePath,
        file_type: fileType,
        status: 'na_fila',
        progress: 0,
        created_at: now,
        updated_at: now,
      });
    
    if (error) {
      throw new Error(`Erro ao criar registro: ${error.message}`);
    }
  };

  // Process source locally via API
  const processSourceLocally = async (sourceId: string, extractedText: string): Promise<void> => {
    const response = await fetch('/api/process-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId, extractedText }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Erro no processamento');
    }
    
    console.log('[upload] Processing result:', data);
  };

  const extractTextFromDocument = async (docFile: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', docFile);
    
    const response = await fetch('/api/extract-document', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Falha ao extrair texto do documento');
    }
    
    const data = await response.json();
    return data.text;
  };

  const handleFileSelect = async (selectedFile: File) => {
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    const isValidType = validTypes.includes(selectedFile.type) || ['pdf', 'docx', 'pptx'].includes(ext || '');
    
    if (!isValidType) {
      alert('Por favor, selecione um arquivo PDF, DOCX ou PPTX.');
      return;
    }
    
    if (selectedFile.size > 50 * 1024 * 1024) {
      alert('O arquivo deve ter no máximo 50MB.');
      return;
    }
    
    setFile(selectedFile);
    setExtracting(true);
    
    try {
      const text = await extractTextFromDocument(selectedFile);
      setPdfText(text);
      setExtracting(false);
    } catch (error) {
      console.error('Error extracting document:', error);
      alert('Erro ao ler o documento. Tente outro arquivo.');
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

  // Handle the simplified upload + processing flow
  const handleUploadAndProcess = async () => {
    if (!file || !user || !pdfText) return;
    
    setStep('processing');
    setStatusMessage('Enviando documento para o servidor...');
    setProgress(10);
    
    try {
      // 1. Upload to Storage
      const { sourceId, storagePath, fileType } = await uploadToStorage(file, user.id);
      setProgress(30);
      setStatusMessage('Documento enviado! Criando registro...');
      
      // 2. Create source record
      await createSourceRecord(sourceId, user.id, file.name, storagePath, fileType);
      setProgress(50);
      setStatusMessage('Processando texto do documento...');
      
      // 3. Process locally (create chunks)
      await processSourceLocally(sourceId, pdfText);
      setProgress(100);
      setStatusMessage('Documento processado com sucesso!');
      
      // 4. Show success and redirect
      setStep('complete');
      
      // Auto-redirect after 1.5 seconds
      setTimeout(() => {
        router.push('/dashboard/runs');
      }, 1500);
      
    } catch (error) {
      console.error('Error in upload flow:', error);
      alert(error instanceof Error ? error.message : 'Erro no upload');
      setStep('upload');
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
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
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f4f4f5' }}>
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
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'rgba(15, 15, 15, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        <Link
          href="/dashboard/runs"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#71717a',
            textDecoration: 'none',
          }}
        >
          <Icons.ArrowLeft />
        </Link>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Upload de Documento</h1>
          <p style={{ fontSize: 13, color: '#71717a', marginTop: 2 }}>
            Adicione um novo documento para gerar conteúdo
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
                border: '2px dashed rgba(255,255,255,0.1)',
                borderRadius: 20,
                padding: 48,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: file ? 'rgba(34, 197, 94, 0.05)' : 'transparent',
                borderColor: file ? '#22c55e' : 'rgba(255,255,255,0.1)',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
              />
              
              {extracting ? (
                <div style={{ color: '#22c55e' }}>
                  <Icons.Loader />
                  <p style={{ marginTop: 16 }}>Lendo documento...</p>
                </div>
              ) : file ? (
                <>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: 'rgba(34, 197, 94, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    color: '#22c55e',
                  }}>
                    <Icons.File />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{file.name}</p>
                  <p style={{ fontSize: 14, color: '#71717a' }}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {pdfText.split(' ').length.toLocaleString()} palavras
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
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      color: '#71717a',
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
                    background: 'rgba(255,255,255,0.03)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                    color: '#52525b',
                  }}>
                    <Icons.Upload />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                    Arraste um documento aqui
                  </p>
                  <p style={{ fontSize: 14, color: '#71717a', marginBottom: 16 }}>
                    ou clique para selecionar
                  </p>
                  <p style={{ fontSize: 13, color: '#52525b' }}>
                    Máximo 50MB • PDF, DOCX ou PPTX
                  </p>
                </>
              )}
            </div>

            {/* Process Button */}
            {file && pdfText && (
              <button
                onClick={handleUploadAndProcess}
                style={{
                  width: '100%',
                  marginTop: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: '18px 32px',
                  background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                  border: 'none',
                  borderRadius: 14,
                  color: 'white',
                  fontSize: 17,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(34, 197, 94, 0.3)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Processar Documento
              </button>
            )}

            <p style={{ 
              textAlign: 'center', 
              marginTop: 16, 
              fontSize: 13, 
              color: '#52525b' 
            }}>
              O documento será processado e ficará disponível para gerar flashcards ou simulados
            </p>
          </>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 32px',
              color: '#22c55e',
            }}>
              <Icons.Loader />
            </div>
            
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
              Processando documento...
            </h2>
            <p style={{ color: '#71717a', marginBottom: 32 }}>
              {statusMessage}
            </p>
            
            {/* Progress Bar */}
            <div style={{
              width: '100%',
              height: 8,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                borderRadius: 4,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 32px',
              color: '#22c55e',
            }}>
              <Icons.Check />
            </div>
            
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
              Documento Processado! ✅
            </h2>
            <p style={{ color: '#71717a', marginBottom: 16 }}>
              Redirecionando para geração de conteúdo...
            </p>
            <p style={{ fontSize: 14, color: '#52525b' }}>
              {file?.name}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
