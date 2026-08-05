"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CadSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: CadSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type CadSpeechRecognitionEvent = {
  results: { [index: number]: { [index: number]: { transcript?: string } } };
};

type SpeechRecognitionCtor = new () => CadSpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useCadSpeech(lang = "pt-BR") {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speechSupported] = useState(() =>
    typeof window !== "undefined" ? Boolean(getSpeechRecognition()) : false,
  );
  const recognitionRef = useRef<CadSpeechRecognition | null>(null);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(
    (onResult?: (text: string) => void) => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) return false;

      stopListening();
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onresult = (event: CadSpeechRecognitionEvent) => {
        const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
        setTranscript(text);
        onResult?.(text);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      return true;
    },
    [lang, stopListening],
  );

  const speak = useCallback(
    (text: string, enabled = true) => {
      if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = 1;
      window.speechSynthesis.speak(utter);
    },
    [lang],
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  return {
    isListening,
    transcript,
    speechSupported,
    startListening,
    stopListening,
    speak,
    setTranscript,
  };
}
