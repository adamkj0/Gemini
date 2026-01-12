
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import React, {useEffect, useRef, useState} from 'react';
import {GoogleGenAI} from '@google/genai';
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
} from 'lucide-react';

// Use the correct initialization with named parameter
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

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
  // Use correct model names according to guidelines
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-image');

  // History states
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const saveState = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const state = canvas.toDataURL();
    setUndoStack((prev) => [...prev, state]);
    setRedoStack([]); // Clear redo stack on new action
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

  // Load background image when generatedImage changes
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

  // Initialize canvas with white background when component mounts
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

  const stopDrawing = () => {
    setIsDrawing(false);
  };

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

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPenColor(e.target.value);
  };

  const openColorPicker = () => {
    colorInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      openColorPicker();
    }
  };

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
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;
      tempCtx.fillStyle = '#FFFFFF';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(canvas, 0, 0);

      const drawingData = tempCanvas.toDataURL('image/png').split(',')[1];

      // Re-initialize AI to avoid potential issues with key lifecycle
      const activeAi = new GoogleGenAI({apiKey: process.env.API_KEY});

      const response = await activeAi.models.generateContent({
        model: selectedModel,
        contents: {
          parts: [
            {inlineData: {data: drawingData, mimeType: 'image/png'}},
            {text: `${prompt}. Use the provided image as context. Keep the style consistent with the input.`}
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
        const imageUrl = `data:image/png;base64,${imageData}`;
        setGeneratedImage(imageUrl);
      } else {
        alert('Failed to generate image. No image data returned. Please try a different prompt.');
      }
    } catch (error: any) {
      console.error('Error submitting drawing:', error);
      setErrorMessage(error.message || 'An unexpected error occurred.');
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const closeErrorModal = () => {
    setShowErrorModal(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preventTouchDefault = (e: TouchEvent) => {
      if (isDrawing) e.preventDefault();
    };

    canvas.addEventListener('touchstart', preventTouchDefault, {passive: false});
    canvas.addEventListener('touchmove', preventTouchDefault, {passive: false});
    
    return () => {
      canvas.removeEventListener('touchstart', preventTouchDefault);
      canvas.removeEventListener('touchmove', preventTouchDefault);
    };
  }, [isDrawing]);

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
                Built with{' '}
                <a className="underline" href="https://ai.google.dev/gemini-api/docs/image-generation" target="_blank" rel="noopener noreferrer">
                  Gemini native image generation
                </a>
              </p>
              <p className="text-sm sm:text-base text-gray-500 mt-1">
                by{' '}
                <a className="underline" href="https://x.com/trudypainter" target="_blank" rel="noopener noreferrer">@trudypainter</a>{' '}
                and{' '}
                <a className="underline" href="https://x.com/alexanderchen" target="_blank" rel="noopener noreferrer">@alexanderchen</a>
              </p>
            </div>

            <menu className="flex items-center bg-gray-300 rounded-full p-2 shadow-sm self-start sm:self-auto gap-2">
              <div className="relative mr-1">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="h-10 rounded-full bg-white pl-3 pr-8 text-sm text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 appearance-none border-2 border-white"
                  aria-label="Select Gemini Model">
                  <option value="gemini-2.5-flash-image">2.5 Flash Image</option>
                  <option value="gemini-3-pro-image-preview">3.0 Pro Image (High Quality)</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <ChevronDown className="w-5 h-5" />
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  title="Undo"
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110 disabled:opacity-30 disabled:pointer-events-none">
                  <Undo2 className="w-5 h-5 text-gray-700" />
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={redoStack.length === 0}
                  title="Redo"
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110 disabled:opacity-30 disabled:pointer-events-none">
                  <Redo2 className="w-5 h-5 text-gray-700" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={triggerFileUpload}
                  title="Upload Image"
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110">
                  <ImageUp className="w-5 h-5 text-gray-700" />
                </button>

                <button
                  type="button"
                  className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center border-2 border-white shadow-sm transition-transform hover:scale-110"
                  onClick={openColorPicker}
                  onKeyDown={handleKeyDown}
                  aria-label="Open color picker"
                  style={{backgroundColor: penColor}}>
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={penColor}
                    onChange={handleColorChange}
                    className="opacity-0 absolute w-px h-px"
                  />
                </button>

                <button
                  type="button"
                  onClick={handleExport}
                  title="Download Image"
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110 group relative"
                  aria-label="Download Image">
                  <Download className="w-5 h-5 text-gray-700" />
                </button>
                
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110"
                  title="Clear Canvas">
                  <Trash2 className="w-5 h-5 text-gray-700" aria-label="Clear Canvas" />
                </button>
              </div>
            </menu>
          </div>

          <div className="w-full mb-6">
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
                placeholder="What should Gemini add or change?"
                className="w-full p-3 sm:p-4 pr-12 sm:pr-14 text-sm sm:text-base border-2 border-black bg-white text-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-mono"
                required
              />
              <button
                type="submit"
                disabled={isLoading}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-none bg-black text-white hover:cursor-pointer hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                {isLoading ? (
                  <LoaderCircle className="w-5 sm:w-6 h-5 sm:h-6 animate-spin" aria-label="Loading" />
                ) : (
                  <SendHorizontal className="w-5 sm:w-6 h-5 sm:h-6" aria-label="Submit" />
                )}
              </button>
            </div>
          </form>
        </main>

        {showErrorModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md w-full p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-gray-700">Failed to generate</h3>
                <button onClick={closeErrorModal} className="text-gray-400 hover:text-gray-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="font-medium text-gray-600">{parseError(errorMessage)}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
