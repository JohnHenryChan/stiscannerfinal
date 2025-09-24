import React, { useState } from 'react';
import SidebarAdmin from '../global/SidebarAdmin';
import TopbarAdmin from '../global/TopbarAdmin';
import { ChevronRightIcon, ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';

const Helps = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const helpTopics = [
    'Syncing attendance across systems',
    'Managing teacher access rights'
  ];

  const filteredTopics = helpTopics.filter(topic =>
    topic.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />

        <div className="flex flex-col flex-grow px-8 py-6 bg-white">
          <h1 className="text-2xl font-semibold mb-4">Help/Support</h1>

          {/* Help Cards */}
          <div className="space-y-4 max-w-2xl">
            {filteredTopics.length > 0 ? (
              filteredTopics.map((topic, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-100 border rounded-md flex items-center justify-between hover:bg-gray-200 cursor-pointer shadow-sm"
                >
                  <span className="text-base font-medium">{topic}</span>
                  <ChevronRightIcon className="w-5 h-5 text-gray-600" />
                </div>
              ))
            ) : (
              <p className="text-gray-500">No help topics found.</p>
            )}
          </div>

          {/* Help/Support Button at the Bottom */}
          <div className="mt-auto pt-12 pl-4">
            <button
              className="flex items-center space-x-2 px-4 py-2 text-white rounded-md shadow transition"
              style={{ backgroundColor: '#0057A4' }}
              onClick={() => alert('Redirecting to Help/Support...')}
            >
              <ChatBubbleBottomCenterTextIcon className="w-6 h-6" />
              <span>Contact Support</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Helps;
