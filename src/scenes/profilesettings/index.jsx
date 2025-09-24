import React from 'react'

const Profilesettings = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="bg-blue-800 text-white p-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Profile Settings</h1>
        <button className="underline">Edit</button>
      </div>

      <div className="p-6 bg-gray-100 flex-grow">
        <h2 className="text-2xl font-bold mb-6">Account Information</h2>

        <div className="bg-white p-6 rounded-md shadow-md space-y-6">
          <div>
            <label className="block font-medium mb-2">Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              className="w-full p-3 border rounded-md"
            />
          </div>

          <div>
            <label className="block font-medium mb-2">Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              className="w-full p-3 border rounded-md"
            />
          </div>

          <div>
            <label className="block font-medium mb-2">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              className="w-full p-3 border rounded-md"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Profilesettings
