import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";

const Admin = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("Admin");
  const [email, setEmail] = useState(user?.email || "");
  const [position, setPosition] = useState("Admin");
  const [campus, setCampus] = useState("STI College Vigan");

  const handleSave = () => {
    setIsEditing(false);
    console.log("Saved:", { name, email, position, campus });
    // optionally update Firestore here
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-white text-[#333] font-sans">
      {/* Header */}
      <div className="bg-[#005BAC] text-white px-10 py-16 w-full relative">
        {/* Back Button */}
        <button
          onClick={() => navigate("/dashboard")}
          className="absolute top-6 left-6 flex items-center text-white hover:text-gray-200 transition text-lg"
        >
          <ArrowLeft className="w-6 h-6 mr-2" />
          Back
        </button>

        <div className="flex items-center mt-10 ml-14">
          <div className="w-24 h-24 bg-gray-300 rounded-full border-4 border-white"></div>

          <div className="ml-6">
            <h2 className="text-4xl font-bold">{name}</h2>
            <p className="text-lg">{campus}</p>
          </div>

          <div className="ml-auto">
            <button
              onClick={() => setIsEditing(true)}
              className="bg-white text-[#005BAC] hover:bg-gray-100 text-lg px-6 py-2 rounded shadow-sm transition"
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Info Section */}
      {!isEditing && (
        <div className="px-8 py-8">
          <h3 className="text-2xl text-[#005BAC] font-bold mb-4">Info</h3>
          <div className="text-lg space-y-2 text-[#444]">
            <p><span className="font-semibold">Position:</span> {position}</p>
            <p><span className="font-semibold">Campus:</span> {campus}</p>
            <p><span className="font-semibold">Email:</span> {email}</p>
          </div>

          <div className="mt-8">
            <button
              onClick={handleLogout}
              className="bg-[#D32F2F] hover:bg-red-700 text-white px-6 py-3 text-lg rounded shadow-sm transition"
            >
              Log out
            </button>
          </div>
        </div>
      )}

      {/* Edit Section */}
      {isEditing && (
        <div className="fixed inset-0 flex justify-center items-center bg-black bg-opacity-40 z-50">
          <div className="bg-white border rounded shadow-lg p-8 w-full max-w-lg">
            <h2 className="text-xl font-semibold mb-6 text-[#005BAC]">Edit Profile</h2>
            <div className="space-y-5 text-left">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-5 py-3 rounded shadow-inner border bg-gray-200 text-lg"
                  placeholder="Enter your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full px-5 py-3 rounded shadow-inner border bg-gray-200 text-lg"
                  placeholder="Enter your position"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
                <input
                  type="text"
                  value={campus}
                  onChange={(e) => setCampus(e.target.value)}
                  className="w-full px-5 py-3 rounded shadow-inner border bg-gray-200 text-lg"
                  placeholder="Enter your campus"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-5 py-3 rounded shadow-inner border bg-gray-200 text-lg"
                  placeholder="Enter your email"
                />
              </div>
              <div className="flex justify-center gap-4 pt-4">
                <button
                  onClick={handleSave}
                  className="bg-[#005BAC] text-white px-8 py-3 rounded hover:bg-blue-700 shadow text-lg"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="bg-gray-300 text-[#333] px-8 py-3 rounded hover:bg-gray-400 shadow text-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
