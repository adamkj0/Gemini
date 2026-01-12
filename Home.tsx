
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import React, {useEffect, useRef, useState} from 'react';
import {GoogleGenAI, Modality, LiveServerMessage} from '@google/genai';
import {
  ChevronDown,
  LoaderCircle,
  SendHorizontal,
  Trash2,
  X,
  ImageUp,
  Undo2,
  Redo2,
  Download,
  Settings,
  Key,
  Mic,
  MicOff
} from 'lucide-react';

interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

// Fixed global window augmentation to match requirement and fix build errors
declare global {
  interface Window {
    aistudio: AIStudio;
  }
}

function parseError(error: string) {
  const regex = /{"error":(.*)}/gm;
  const m = regex.exec(error);
  try {
    const e = m[1];
    const err = JSON.parse(e);
    return err.message || error;
  } catch (e) {
    return error;
  }
}

// Audio helpers
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundImageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-image');
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // Voice states
  const [isListening, setIsListening] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  // History states
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  useEffect(() => {
    checkApiKey();
    return () => stopListening();
  }, []);

  const checkApiKey = async () => {
    const exists = await window.aistudio.hasSelectedApiKey();
    setHasKey(exists);
  };

  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      // Assume successful selection to avoid race conditions
      setHasKey(true);
    } catch (err) {
      console.error("Failed to open key selector", err);
    }
  };

  // --- Optimized Voice Integration ---
  const startListening = async () => {
    if (isListening) return;
    setIsListening(true);
    
    try {
      // Create new instance to ensure latest API key from context is used
      const activeAi = new GoogleGenAI({apiKey: process.env.API_KEY});
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
      audioContextRef.current = audioContext;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = activeAi.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = audioContext.createMediaStreamSource(stream);
            // Smaller buffer size for lower latency
            const processor = audioContext.createScriptProcessor(2048, 1, 1);
            processorRef.current = processor;
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              // Always use the promise to send to avoid stale closures
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Check for transcription in a smooth continuous way
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              if (text) {
                setPrompt(prev => {
                   const lastChar = prev.slice(-1);
                   const space = (prev.length > 0 && lastChar !== ' ') ? ' ' : '';
                   return prev + space + text;
                });
              }
            }
          },
          onclose: () => stopListening(),
          onerror: (e) => {
            console.error("Live API error", e);
            stopListening();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          systemInstruction: 'Anda adalah transkrip bot. Dengar suara pengguna dan tukarkan kepada teks Bahasa Melayu KL yang santai (slang KL). Jangan jawab, jangan borak. Tulis apa yang didengar sahaja secara direct.',
        }
      });
      
      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      console.error("Voice start error:", err);
      stopListening();
    }
  };

  const stopListening = () => {
    setIsListening(false);
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    sessionPromiseRef.current = null;
  };

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  // --- Canvas Logic ---
  const saveState = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const state = canvas.toDataURL();
    setUndoStack((prev) => [...prev, state]);
    setRedoStack([]);
  };

  const loadState = (dataUrl: string) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new window.Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  };

  const undo = () => {
    if (undoStack.length === 0 || !canvasRef.current) return;
    const currentState = canvasRef.current.toDataURL();
    const previousState = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, currentState]);
    setUndoStack((prev) => prev.slice(0, -1));
    loadState(previousState);
  };

  const redo = () => {
    if (redoStack.length === 0 || !canvasRef.current) return;
    const currentState = canvasRef.current.toDataURL();
    const nextState = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, currentState]);
    setRedoStack((prev) => prev.slice(0, -1));
    loadState(nextState);
  };

  useEffect(() => {
    if (generatedImage && canvasRef.current) {
      const img = new window.Image();
      img.onload = () => {
        backgroundImageRef.current = img;
        drawImageToCanvas();
        saveState();
      };
      img.src = generatedImage;
    }
  }, [generatedImage]);

  useEffect(() => {
    if (canvasRef.current) {
      initializeCanvas();
    }
  }, []);

  const initializeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const drawImageToCanvas = () => {
    if (!canvasRef.current || !backgroundImageRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = backgroundImageRef.current;
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const x = (canvas.width / 2) - (img.width / 2) * scale;
    const y = (canvas.height / 2) - (img.height / 2) * scale;
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
  };

  const getCoordinates = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return {x: 0, y: 0};
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: any) => {
    saveState();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const {x, y} = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const {x, y} = getCoordinates(e);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = penColor;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    saveState(); 
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setGeneratedImage(null);
    backgroundImageRef.current = null;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setGeneratedImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileUpload = () => fileInputRef.current?.click();
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => setPenColor(e.target.value);
  const openColorPicker = () => colorInputRef.current?.click();

  const handleExport = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.download = `gemini-drawing-${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    setIsLoading(true);
    try {
      const canvas = canvasRef.current;
      const drawingData = canvas.toDataURL('image/png').split(',')[1];
      // Create new instance to ensure latest API key is used
      const activeAi = new GoogleGenAI({apiKey: process.env.API_KEY});

      const response = await activeAi.models.generateContent({
        model: selectedModel,
        contents: {
          parts: [
            {inlineData: {data: drawingData, mimeType: 'image/png'}},
            {text: `${prompt}. Sila gunakan Bahasa Melayu KL jika ada teks dalam imej. Gunakan input ini sebagai konteks.`}
          ]
        }
      });

      let imageData = null;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageData = part.inlineData.data;
            break;
          }
        }
      }

      if (imageData) {
        setGeneratedImage(`data:image/png;base64,${imageData}`);
      } else {
        alert('Maaf, imej tidak berjaya dihasilkan.');
      }
    } catch (error: any) {
      const msg = error.message || '';
      // Reset key selection if entity not found error occurs
      if (msg.includes("Requested entity was not found")) {
        setHasKey(false);
        setErrorMessage("Sesi kunci API tamat atau tidak sah.");
      } else {
        setErrorMessage(msg || 'Ralat tidak dijangka berlaku.');
      }
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <Key className="w-16 h-16 mx-auto mb-6 text-black" />
          <h1 className="text-2xl font-bold mb-4">Kunci API Diperlukan</h1>
          <p className="text-gray-600 mb-6 font-mono text-sm">
            Sila pilih kunci API dari projek GCP yang berbayar untuk kualiti terbaik.
          </p>
          <div className="space-y-4">
            <button onClick={handleSelectKey} className="w-full bg-black text-white font-bold py-3 px-6 hover:bg-gray-800 transition-colors">
              Pilih Kunci API
            </button>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="block text-sm underline text-gray-500 hover:text-black">
              Dokumentasi Pembayaran
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen notebook-paper-bg text-gray-900 flex flex-col justify-start items-center">
        <main className="container mx-auto px-3 sm:px-6 py-5 sm:py-10 pb-32 max-w-5xl w-full">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-2 sm:mb-6 gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-0 leading-tight font-mega text-black">
                Gemini Co-Drawing
              </h1>
              <p className="text-sm sm:text-base text-gray-500 mt-1">
                Kreativiti AI Kolaboratif (Bahasa Melayu)
              </p>
            </div>

            <menu className="flex items-center bg-gray-300 rounded-full p-2 shadow-sm self-start sm:self-auto gap-2">
              <div className="flex items-center gap-1">
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="h-10 rounded-full bg-white pl-3 pr-8 text-sm text-gray-700 shadow-sm transition-all hover:bg-gray-50 appearance-none border-2 border-white"
                  >
                    <option value="gemini-2.5-flash-image">2.5 Flash</option>
                    <option value="gemini-3-pro-image-preview">3.0 Pro (HQ)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
                
                <button onClick={handleSelectKey} title="Tetapan API" className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm hover:scale-110">
                  <Settings className="w-5 h-5 text-gray-700" />
                </button>
              </div>

              <div className="h-6 w-px bg-gray-400 mx-1" />

              <div className="flex items-center gap-1">
                <button onClick={undo} disabled={undoStack.length === 0} className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm disabled:opacity-30">
                  <Undo2 className="w-5 h-5 text-gray-700" />
                </button>
                <button onClick={redo} disabled={redoStack.length === 0} className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm disabled:opacity-30">
                  <Redo2 className="w-5 h-5 text-gray-700" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                <button onClick={triggerFileUpload} className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm hover:scale-110">
                  <ImageUp className="w-5 h-5 text-gray-700" />
                </button>

                <button
                  type="button"
                  className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center border-2 border-white shadow-sm transition-transform hover:scale-110"
                  onClick={openColorPicker}
                  style={{backgroundColor: penColor}}>
                  <input ref={colorInputRef} type="color" value={penColor} onChange={handleColorChange} className="opacity-0 absolute w-px h-px" />
                </button>

                <button onClick={handleExport} title="Muat Turun" className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm">
                  <Download className="w-5 h-5 text-gray-700" />
                </button>
                
                <button onClick={clearCanvas} className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm">
                  <Trash2 className="w-5 h-5 text-gray-700" />
                </button>
              </div>
            </menu>
          </div>

          <div className="w-full mb-6 relative group">
            <canvas
              ref={canvasRef}
              width={960}
              height={540}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="border-2 border-black w-full hover:cursor-crosshair sm:h-[60vh] h-[30vh] min-h-[320px] bg-white/90 touch-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            />
          </div>

          <form onSubmit={handleSubmit} className="w-full">
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Lakar sesuatu, kemudian guna suara KL..."
                className="w-full p-4 pr-28 text-base border-2 border-black bg-white text-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-mono"
                required
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-2.5 rounded-full transition-all duration-300 ${isListening ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)] scale-110' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  title={isListening ? 'Berhenti mendengar' : 'Guna suara (KL)'}
                >
                  {isListening ? <MicOff className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="p-2 rounded-none bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 transition-colors">
                  {isLoading ? <LoaderCircle className="w-6 h-6 animate-spin" /> : <SendHorizontal className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </form>
        </main>

        {showErrorModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md w-full p-6 animate-in zoom-in duration-200">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold">Perhatian!</h3>
                <button onClick={() => setShowErrorModal(false)} className="text-gray-400 hover:text-black">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-gray-600 font-medium mb-6">{parseError(errorMessage)}</p>
              <button onClick={() => setShowErrorModal(false)} className="w-full bg-black text-white font-bold py-2 hover:bg-gray-800">
                Faham
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
