// 👇 Updated SidebarAdmin.jsx
import React, { useState } from "react";
import { HiMenuAlt3 } from "react-icons/hi";
import { Link } from "react-router-dom";
import { MdOutlineDashboard, MdOutlineRecordVoiceOver } from "react-icons/md";
import { PiChalkboardTeacherLight } from "react-icons/pi";
import { IoIosHelpCircleOutline } from "react-icons/io";
import { MdLibraryBooks } from "react-icons/md";
import { IoMdPerson } from "react-icons/io";
import { useAuth } from "../../context/AuthContext";

const SidebarAdmin = () => {
  const { role } = useAuth();
  const [open, setOpen] = useState(true);

  const menus = [
    { name: "Dashboard", link: "/dashboard", icon: MdOutlineDashboard },

    // Attendance Record visible only to admin, guidance counselor, instructor
    ...(role === "admin" || role === "guidance counselor" || role === "instructor"
      ? [{ name: "Attendance Record", link: "/attendancerecord", icon: MdOutlineRecordVoiceOver }]
      : []),

    // User Management (was Instructor Management) visible only to admin and registrar
    ...(role === "admin" || role === "registrar"
      ? [{ name: "User Management", link: "/teachermanagement", icon: PiChalkboardTeacherLight }]
      : []),

    // Student Management visible to admin and registrar
    ...(role === "admin" || role === "registrar"
      ? [{ name: "Student Management", link: "/studentmanagement", icon: IoMdPerson }]
      : []),

    { name: "Subject Management", link: "/subjectmanagement", icon: MdLibraryBooks },

    // Help/Support remains
    { name: "Help/Support", link: "/helps", icon: IoIosHelpCircleOutline },
  ];

  return (
    <section className="flex gap-6">
      {/* make the sidebar stick to viewport top and occupy full height so it doesn't scroll with page */}
      <div className={`bg-amber ${open ? "w-72" : "w-16"} duration-500 text-black px-4 sticky top-0 h-screen overflow-hidden`}>
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
