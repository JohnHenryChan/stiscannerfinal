import React from "react";

const AccessDenied = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
      <h1 className="text-3xl font-bold text-red-600 mb-4">Access Denied</h1>
      <p className="text-gray-700">
        You do not have permission to view this page.
      </p>
    </div>
  );
};

export default AccessDenied;
