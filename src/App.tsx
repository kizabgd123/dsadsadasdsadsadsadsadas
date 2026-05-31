import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Camera, Image as ImageIcon, Loader2, Settings2, ChefHat, LayoutGrid, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        try {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasKey(selected);
        } catch (e) {
          setHasKey(false);
        }
      } else {
        setHasKey(true);
      }
      setLoading(false);
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        setHasKey(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (loading) return null;

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-[#f5f2ed] p-6 font-sans">
        <div className="max-w-md w-full bg-[#1a1a1a] p-10 rounded-3xl border border-white/10 text-center">
          <Camera className="w-12 h-12 mx-auto mb-6 text-[#c8a97e]" />
          <h2 className="text-3xl font-serif font-light mb-4">API Key Required</h2>
          <p className="text-white/60 mb-8 text-sm leading-relaxed">
            Lumière Virtual Photographer uses high-quality image generation models that require a paid Google Cloud API key.
          </p>
          <button
            onClick={handleSelectKey}
            className="bg-[#c8a97e] hover:bg-[#b6976c] text-black px-8 py-4 rounded-full text-sm font-medium tracking-widest uppercase transition-colors w-full"
          >
            Connect API Key
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const STYLES = {
  'Rustic/Dark': 'Rustic, dark moody lighting, wooden table, dramatic shadows, professional food photography, 85mm lens, shallow depth of field, highly detailed, cinematic.',
  'Bright/Modern': 'Bright, modern, clean white marble background, airy, natural sunlight, professional food photography, sharp focus, vibrant colors, highly detailed, minimalist.',
  'Social Media': 'Top-down flat lay, social media aesthetic, colorful props, trendy, professional food photography, bright even lighting, highly detailed, appetizing.'
};

type ImageSize = '1K' | '2K' | '4K';
type StyleKey = keyof typeof STYLES;

interface Dish {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  loading?: boolean;
  error?: string;
}

function MainApp() {
  const [menuText, setMenuText] = useState("Starters\n- Truffle Arancini: Crispy risotto balls with black truffle and mozzarella.\n- Burrata & Heirloom Tomato: Fresh burrata, basil oil, balsamic glaze.\n\nMains\n- Wagyu Ribeye: 8oz wagyu beef, roasted garlic mash, asparagus.\n- Lobster Ravioli: Handmade ravioli, creamy bisque, chives.");
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [style, setStyle] = useState<StyleKey>('Rustic/Dark');
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [isParsing, setIsParsing] = useState(false);

  const getApiKey = () => {
    return (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
  };

  const parseMenu = async () => {
    if (!menuText.trim()) return;
    setIsParsing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: getApiKey() });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Parse the following restaurant menu and extract a list of dishes. For each dish, provide its name and a visual description based on its ingredients or typical presentation.\n\nMenu:\n${menuText}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Name of the dish" },
                description: { type: Type.STRING, description: "Visual description of the dish" }
              },
              required: ["name", "description"]
            }
          }
        }
      });

      const parsedDishes = JSON.parse(response.text || '[]');
      setDishes(parsedDishes.map((d: any) => ({ ...d, id: crypto.randomUUID() })));
    } catch (error) {
      console.error("Failed to parse menu:", error);
      alert("Failed to parse menu. Please try again.");
    } finally {
      setIsParsing(false);
    }
  };

  const generateImage = async (dishId: string) => {
    setDishes(prev => prev.map(d => d.id === dishId ? { ...d, loading: true, error: undefined } : d));
    
    const dish = dishes.find(d => d.id === dishId);
    if (!dish) return;

    try {
      const ai = new GoogleGenAI({ apiKey: getApiKey() });
      const prompt = `A highly realistic, mouth-watering food photography shot of ${dish.name}. ${dish.description}. Style: ${STYLES[style]}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: imageSize
          }
        }
      });

      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!imageUrl) throw new Error("No image generated");

      setDishes(prev => prev.map(d => d.id === dishId ? { ...d, imageUrl, loading: false } : d));
    } catch (error: any) {
      console.error("Image generation failed:", error);
      let errorMessage = "Failed to generate image.";
      if (error.message?.includes("Requested entity was not found")) {
         errorMessage = "API Key error. Please re-select your API key.";
      }
      setDishes(prev => prev.map(d => d.id === dishId ? { ...d, loading: false, error: errorMessage } : d));
    }
  };

  const generateAll = async () => {
    for (const dish of dishes) {
      if (!dish.imageUrl && !dish.loading) {
        await generateImage(dish.id);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f2ed] font-sans flex flex-col md:flex-row">
      {/* Left Sidebar */}
      <div className="w-full md:w-[400px] lg:w-[480px] border-r border-white/10 bg-[#0f0f0f] p-8 flex flex-col h-screen overflow-y-auto shrink-0">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-full border border-[#c8a97e] flex items-center justify-center">
            <Camera className="w-5 h-5 text-[#c8a97e]" />
          </div>
          <div>
            <h1 className="text-xl font-serif font-light tracking-wide">Lumière</h1>
            <p className="text-[10px] uppercase tracking-widest text-white/40">Virtual Photographer</p>
          </div>
        </div>

        <div className="space-y-8 flex-1">
          <section>
            <label className="block text-xs uppercase tracking-widest text-white/60 mb-3">1. Menu Text</label>
            <textarea
              value={menuText}
              onChange={(e) => setMenuText(e.target.value)}
              className="w-full h-48 bg-black/50 border border-white/10 rounded-2xl p-4 text-sm text-white/80 focus:outline-none focus:border-[#c8a97e] transition-colors resize-none"
              placeholder="Paste your menu here..."
            />
            <button
              onClick={parseMenu}
              disabled={isParsing || !menuText.trim()}
              className="mt-4 w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white px-6 py-3 rounded-full text-xs font-medium tracking-widest uppercase transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChefHat className="w-4 h-4" />}
              {isParsing ? 'Extracting Dishes...' : 'Extract Dishes'}
            </button>
          </section>

          <section>
            <label className="block text-xs uppercase tracking-widest text-white/60 mb-3">2. Photography Style</label>
            <div className="grid gap-2">
              {(Object.keys(STYLES) as StyleKey[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    style === s 
                      ? 'bg-[#c8a97e]/10 border-[#c8a97e] text-[#c8a97e]' 
                      : 'bg-black/50 border-white/10 text-white/60 hover:border-white/20'
                  }`}
                >
                  <div className="text-sm font-medium mb-1">{s}</div>
                  <div className="text-xs opacity-70 line-clamp-1">{STYLES[s]}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-xs uppercase tracking-widest text-white/60 mb-3">3. Image Resolution</label>
            <div className="flex gap-2">
              {(['1K', '2K', '4K'] as ImageSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => setImageSize(size)}
                  className={`flex-1 py-3 rounded-full border text-xs font-medium tracking-widest transition-all ${
                    imageSize === size
                      ? 'bg-[#c8a97e] border-[#c8a97e] text-black'
                      : 'bg-transparent border-white/20 text-white/60 hover:border-white/40'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 h-screen overflow-y-auto bg-[#0a0a0a] p-8 lg:p-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-serif font-light">
              {dishes.length > 0 ? 'Generated Portfolio' : 'Awaiting Menu'}
            </h2>
            {dishes.length > 0 && (
              <button
                onClick={generateAll}
                className="bg-[#c8a97e] hover:bg-[#b6976c] text-black px-6 py-2.5 rounded-full text-xs font-medium tracking-widest uppercase transition-colors flex items-center gap-2"
              >
                <ImageIcon className="w-4 h-4" />
                Generate All
              </button>
            )}
          </div>

          {dishes.length === 0 ? (
            <div className="h-[60vh] flex flex-col items-center justify-center text-white/20 border border-white/5 rounded-3xl border-dashed">
              <LayoutGrid className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-sm uppercase tracking-widest">Extract dishes to begin</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              <AnimatePresence>
                {dishes.map((dish) => (
                  <motion.div
                    key={dish.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#151515] border border-white/10 rounded-3xl overflow-hidden flex flex-col group"
                  >
                    <div className="aspect-square bg-black relative overflow-hidden">
                      {dish.imageUrl ? (
                        <img 
                          src={dish.imageUrl} 
                          alt={dish.name} 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                          {dish.loading ? (
                            <>
                              <Loader2 className="w-8 h-8 text-[#c8a97e] animate-spin mb-4" />
                              <p className="text-xs uppercase tracking-widest text-[#c8a97e]">Shooting...</p>
                            </>
                          ) : dish.error ? (
                            <>
                              <AlertCircle className="w-8 h-8 text-red-400 mb-4" />
                              <p className="text-xs text-red-400 mb-4">{dish.error}</p>
                              <button
                                onClick={() => generateImage(dish.id)}
                                className="text-xs uppercase tracking-widest text-white/60 hover:text-white underline underline-offset-4"
                              >
                                Retry
                              </button>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-8 h-8 text-white/20 mb-4" />
                              <button
                                onClick={() => generateImage(dish.id)}
                                className="bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-full text-xs font-medium tracking-widest uppercase transition-colors"
                              >
                                Generate Photo
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="p-6 flex-1 flex flex-col">
                      <h3 className="text-lg font-serif mb-2 text-white/90">{dish.name}</h3>
                      <p className="text-sm text-white/50 leading-relaxed flex-1">{dish.description}</p>
                      
                      {dish.imageUrl && (
                        <button
                          onClick={() => generateImage(dish.id)}
                          disabled={dish.loading}
                          className="mt-4 text-[10px] uppercase tracking-widest text-white/40 hover:text-[#c8a97e] transition-colors self-start flex items-center gap-1"
                        >
                          {dish.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Settings2 className="w-3 h-3" />}
                          Regenerate
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ApiKeyGate>
      <MainApp />
    </ApiKeyGate>
  );
}
