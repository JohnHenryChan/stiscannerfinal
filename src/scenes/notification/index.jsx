import React from "react";
import { useNavigate } from "react-router-dom";

const Notification = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1); // Go back to previous page
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar with background */}
      <div className="flex justify-between items-center p-4 shadow bg-blue sticky top-0 z-10">
        <button
          onClick={handleBack}
          className="text-white text-3xl font-bold hover:underline transition"
        >
          ←
        </button>

        <button className="text-sm text-white hover:underline">
          Mark all as read
        </button>
      </div>

      <div className="p-6">
        <h1 className="text-3xl font-bold text-black mb-6">Notifications</h1>

        {/* Today Section */}
        <div className="space-y-2">
          <p className="text-gray-600 font-semibold">Today</p>

          <div className="bg-green-50 border rounded-md p-4">
            <p className="text-red-600 font-semibold">
              Warning! Student absent for 3 days
            </p>
            <p className="text-sm text-gray-700">Juan D. Cruz, BSCS 101</p>
          </div>

          <div className="bg-green-50 border rounded-md p-4">
            <p className="text-gray-700">Professor has logged into the server</p>
          </div>
        </div>

        {/* Yesterday Section */}
        <div className="space-y-2 mt-6">
          <p className="text-gray-600 font-semibold">Yesterday</p>

          <div className="bg-green-50 border rounded-md p-4">
            <p className="text-red-600 font-semibold">
              Warning! Student absent for 3 days
            </p>
            <p className="text-sm text-gray-700">Diego D. Diega, BSCS 101</p>
          </div>

          <div className="bg-green-50 border rounded-md p-4">
            <p className="text-gray-700">
              Professor 1 has logged into the server
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notification;
