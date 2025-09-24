import React from 'react'
import SidebarAdmin from '../global/SidebarAdmin'
import TopbarAdmin from '../global/TopbarAdmin'
import { ChevronRight } from 'lucide-react'

const Settings = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />
        <div className="flex flex-col flex-grow px-8 py-6 bg-white">
          <h1 className="text-2xl font-semibold mb-4">Settings</h1>

          {/* Settings Cards */}
          <div className="space-y-4 max-w-2xl">
            {[
              'Profile Settings', 
              'Permission Management',
              'Notification Preferences',
            ].map((item, index) => (
              <div
                key={index}
                className="p-4 bg-gray-100 border rounded-md hover:bg-gray-200 cursor-pointer flex items-center justify-between"
              >
                <h2 className="text-lg font-medium">{item}</h2>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
