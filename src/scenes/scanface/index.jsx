import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const FaceId = () => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(true);

  const turnCameraOn = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setCameraOn(true);
    } catch (error) {
      console.error("Camera access failed:", error);
    }
  };

  const turnCameraOff = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  };

  const toggleCamera = () => {
    cameraOn ? turnCameraOff() : turnCameraOn();
  };

  useEffect(() => {
    turnCameraOn();
    return () => {
      turnCameraOff();
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Blue Top Bar */}
      <div className="bg-blue text-white px-6 py-4 shadow-md flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-white text-2xl font-bold hover:underline transition"
        >
          ←
        </button>
        <span className="text-lg font-semibold">Face ID Scanner</span>
        <div className="w-8" /> {/* Spacer to balance the layout */}
      </div>
      
      <h2 className="text-center text-xl font-semibold text-gray-700 my-6"/>
      
      {/* Camera Section */}
      <div className="relative w-full max-w-2xl h-[650px] mx-auto bg-black rounded overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        <button
          onClick={toggleCamera}
          className="absolute z-10 top-10 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-5 py-2 rounded-full shadow-lg hover:bg-blue-700 transition"
        >
          {cameraOn ? "Turn Off" : "Turn On"}
        </button>
      </div>
    </div>
  );
};

export default FaceId;
