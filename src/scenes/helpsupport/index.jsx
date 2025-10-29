import React, { useState } from 'react';
import SidebarAdmin from '../global/SidebarAdmin';
import TopbarAdmin from '../global/TopbarAdmin';
import { ChevronRightIcon, ChevronDownIcon, ArrowDownTrayIcon, ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';

const Helps = () => {
  const [openFAQ, setOpenFAQ] = useState(null);

  // FAQ Section (only the four system FAQs)
  const faqs = [
    {
      question: "Why is a student missing from a class list?",
      answer:
        "The registrar might not have updated the enrollment list for that subject yet. Ensure the student is enrolled in the correct subject in the Registrar module.",
    },
    {
      question: "Why are some RFID cards not detected by the system?",
      answer:
        "The card might be defective or unregistered. Try rescanning or registering the card again under the student’s profile in the Admin panel.",
    },
    {
      question: "Why does the system show “Face not recognized” for some students?",
      answer:
        "Poor lighting or incomplete facial data can cause this issue. Ask the admin to re-register the student’s facial profile under stable lighting.",
    },
    {
      question: "Why are attendance logs not updating in real-time?",
      answer:
        "The system depends on an active internet connection. Once reconnected, it automatically syncs offline attendance data.",
    },
    {
      question: "Why does the system load slowly sometimes?",
      answer:
        "Internet connection or server response might be slow. Try refreshing the page or checking your connection.",
    },
    {
      question: "Why is the system showing wrong attendance status?",
      answer:
        "The student may have scanned the RFID without face verification. Both are required for valid attendance.",
    },
    
  ];

  // Replace this link with your actual PDF handbook URL
  const handbookUrl = "/student-handbook.pdf";

  return (
    <div className="flex flex-col min-h-screen">
      <TopbarAdmin />
      <div className="flex flex-grow">
        <SidebarAdmin />

        <div className="flex flex-col flex-grow px-8 py-6 bg-gray-50 overflow-y-auto">
          <h1 className="text-2xl font-semibold mb-6">Help / Support</h1>

          {/* FAQ Section */}
          <div className="max-w-2xl mb-10">
            <h2 className="text-xl font-semibold mb-4 text-[#0057A4]">
              Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="border rounded-md p-3 bg-white shadow-sm"
                >
                  <button
                    className="flex justify-between items-center w-full text-left font-medium"
                    onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                  >
                    {faq.question}
                    {openFAQ === index ? (
                      <ChevronDownIcon className="w-5 h-5 text-[#0057A4]" />
                    ) : (
                      <ChevronRightIcon className="w-5 h-5 text-[#0057A4]" />
                    )}
                  </button>
                  {openFAQ === index && (
                    <p className="mt-2 text-gray-600">{faq.answer}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Student Handbook Section */}
          <div className="max-w-4xl">
            <h2 className="text-xl font-semibold mb-3 text-[#0057A4]">
              Student Handbook
            </h2>
            <p className="text-gray-600 mb-3">
              Click below to open or download the official STI Student Handbook
              for school rules, policies, and services.
            </p>

            <a
              href={handbookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-[#0057A4] text-white rounded-md shadow hover:bg-[#004080] transition w-fit"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              Download PDF
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Helps;
