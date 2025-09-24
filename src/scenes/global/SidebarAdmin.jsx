// 👇 Updated SidebarAdmin.jsx
import React, { useState } from "react";
import { HiMenuAlt3 } from "react-icons/hi";
import { Link } from "react-router-dom";
import { MdOutlineDashboard, MdOutlineRecordVoiceOver } from "react-icons/md";
import { PiChalkboardTeacherLight } from "react-icons/pi";
import { CiSettings } from "react-icons/ci";
import { IoIosHelpCircleOutline } from "react-icons/io";
import { MdLibraryBooks } from "react-icons/md";
import { IoMdPerson } from "react-icons/io";
import { useAuth } from "../../context/AuthContext";

const SidebarAdmin = () => {
  const { role } = useAuth();
  const [open, setOpen] = useState(true);

  const menus = [
    { name: "Dashboard", link: "/dashboard", icon: MdOutlineDashboard },
    { name: "Attendance Record", link: "/attendancerecord", icon: MdOutlineRecordVoiceOver },
    ...(role === "admin" ? [
      { name: "Student Management", link: "/studentmanagement", icon: IoMdPerson }
    ] : []),
    { name: "Subject Management", link: "/subjectmanagement", icon: MdLibraryBooks },
    { name: "Instructor Management", link: "/teachermanagement", icon: PiChalkboardTeacherLight },
    { name: "Settings", link: "/settings", icon: CiSettings },
    { name: "Help/Support", link: "/helps", icon: IoIosHelpCircleOutline },
  ];

  return (
    <section className="flex gap-6">
      <div className={`bg-amber min-h-screen sticky ${open ? "w-72" : "w-16"} duration-500 text-black px-4`}>
        <div className="py-3 flex justify-end">
          <HiMenuAlt3 size={26} className="cursor-pointer" onClick={() => setOpen(!open)} />
        </div>

        <div className="mt-4 flex flex-col gap-4 relative">
          {menus.map((menu, i) => (
            <Link
              to={menu.link}
              key={i}
              className="group flex items-center text-sm gap-3.5 font-medium p-2 hover:bg-white hover:text-black rounded-md relative"
            >
              <div>{React.createElement(menu.icon, { size: 20 })}</div>
              <h2
                style={{ transitionDelay: `${(i + 3) * 100}ms` }}
                className={`whitespace-pre duration-500 ${!open ? "opacity-0 translate-x-28 overflow-hidden" : ""}`}
              >
                {menu.name}
              </h2>
              {!open && (
                <h2 className="absolute left-16 bg-white text-gray-900 font-semibold rounded-md drop-shadow-lg px-2 py-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {menu.name}
                </h2>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SidebarAdmin;
