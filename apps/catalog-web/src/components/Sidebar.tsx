// 'use client';

// import Link from 'next/link';
// import { usePathname } from 'next/navigation';
// import { cn } from '@/lib/utils';
// import Image from 'next/image';
// import {
//   Package, Users, Tags, FolderTree, Upload, Download, FileText,
//   ChevronLeft, ChevronRight,
// } from 'lucide-react';
// import { useState, useEffect } from 'react';

// const navItems = [
//   { name: 'Catalog', href: '/admin/catalog', icon: Package },
//   { name: 'Vendors', href: '/admin/vendors', icon: Users },
//   { name: 'Product Types', href: '/admin/product-types', icon: FolderTree },
//   { name: 'Tags', href: '/admin/tags', icon: Tags },
//   { name: 'Ingest (CSV/PDF)', href: '/admin/ingest', icon: Upload },
//   { name: 'Shopify Export', href: '/admin/export', icon: Download },
//   { name: 'Audit Log', href: '/admin/audit-log', icon: FileText },
// ];

// export default function Sidebar({ isItAdmin = false }: { isItAdmin?: boolean }) {
//   const pathname = usePathname();
//   const [isExpanded, setIsExpanded] = useState(true);
//   const [mounted, setMounted] = useState(false);

//   useEffect(() => {
//     setMounted(true);
//   }, []);

//   const toggleSidebar = () => setIsExpanded(!isExpanded);

//   // --- static placeholder (server + initial client) ---
//   if (!mounted) {
//     return (
//       <aside className="h-screen bg-white border-r border-gray-200 flex flex-col w-64 shadow-md">
//         {/* Brand block */}
//        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
//   <Image
//     src="/factory.png"
//     alt="US Frame Factory"
//     width={36}
//     height={36}
//     className="rounded"
//   />

//   <span className="text-sm font-bold tracking-tight text-gray-800">
//     US Frame Factory
//   </span>
// </div>
//         <nav className="flex-1 overflow-y-auto p-2 space-y-1">
//           {navItems.map((item) => (
//             <div
//               key={item.name}
//               className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-gray-700"
//             >
//               <item.icon size={20} className="flex-shrink-0 text-gray-600" />
//               <span>{item.name}</span>
//             </div>
//           ))}
//         </nav>
//         <div className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
//           <span className="text-indigo-600 font-medium">USFF ERP</span> · Admin
//         </div>
//       </aside>
//     );
//   }

//   // --- interactive sidebar (after mount) ---
//   return (
//     <aside
//       className={cn(
//         'h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-300 shadow-md',
//         isExpanded ? 'w-64' : 'w-14'
//       )}
//     >
//       {/* Brand block */}
//       <div
//         className={cn(
//           'flex items-center border-b border-gray-200 px-5 py-4',
//           isExpanded ? 'gap-3' : 'justify-center'
//         )}
//       >
//         <Image
//   src="/factory.png"
//   alt="US Frame Factory"
//   width={36}
//   height={36}
//   className="rounded shrink-0"
// />
//         {isExpanded && (
//           <span className="text-sm font-bold tracking-tight text-gray-800">
//             US Frame Factory
//           </span>
//         )}
//         <button
//           onClick={toggleSidebar}
//           className={cn(
//             'p-1 rounded-md hover:bg-gray-100 focus:outline-none text-gray-500',
//             isExpanded ? 'ml-auto' : ''
//           )}
//           aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
//         >
//           {isExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
//         </button>
//       </div>

//       <nav className="flex-1 overflow-y-auto p-2 space-y-1">
//         {navItems.map((item) => {
//           const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
//           const Icon = item.icon;
//           return (
//             <Link
//               key={item.name}
//               href={item.href}
//               className={cn(
//                 'flex items-center gap-3 rounded-md text-sm font-medium transition-colors',
//                 isExpanded ? 'px-3 py-2' : 'px-2 py-2 justify-center',
//                 isActive
//                   ? 'bg-indigo-600 text-white'
//                   : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
//               )}
//               title={!isExpanded ? item.name : undefined}
//             >
//               <Icon size={20} className={cn('flex-shrink-0', isActive ? 'text-white' : 'text-gray-600')} />
//               {isExpanded && <span>{item.name}</span>}
//             </Link>
//           );
//         })}
//       </nav>

//       <div
//         className={cn(
//           'border-t border-gray-200 text-xs text-gray-500',
//           isExpanded ? 'px-4 py-3 text-left' : 'px-2 py-3 text-center'
//         )}
//       >
//         {isExpanded ? (
//           <>
//             <span className="text-indigo-600 font-medium">USFF ERP</span> · Admin
//           </>
//         ) : (
//           <span className="text-indigo-600 font-medium">A</span>
//         )}
//       </div>
//     </aside>
//   );
// }'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import {
  Package, Users, Tags, FolderTree, Upload, Download, FileText,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

type Props = {
  isItAdmin?: boolean;
  isExpanded: boolean;
  setIsExpanded: (v: boolean) => void;
};

const navItems = [
  { name: 'Catalog', href: '/admin/catalog', icon: Package },
  { name: 'Vendors', href: '/admin/vendors', icon: Users },
  { name: 'Product Types', href: '/admin/product-types', icon: FolderTree },
  { name: 'Tags', href: '/admin/tags', icon: Tags },
  { name: 'Ingest (CSV/PDF)', href: '/admin/ingest', icon: Upload },
  { name: 'Shopify Export', href: '/admin/export', icon: Download },
  { name: 'Audit Log', href: '/admin/audit-log', icon: FileText },
];

export default function Sidebar({
  isItAdmin = false,
  isExpanded,
  setIsExpanded,
}: Props) {
  const pathname = usePathname();

  const toggleSidebar = () => setIsExpanded(!isExpanded);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-dvh bg-white border-r border-gray-200 flex flex-col transition-all duration-300 shadow-md z-50',
        isExpanded ? 'w-64' : 'w-14'
      )}
    >
      {/* BRAND */}
      <div
        className={cn(
          'flex items-center border-b border-gray-200 px-5 py-4',
          isExpanded ? 'gap-3' : 'justify-center'
        )}
      >
        <Image
          src="/factory.png"
          alt="Factory"
          width={36}
          height={36}
          className="rounded shrink-0"
        />

        {isExpanded && (
          <span className="text-sm font-bold tracking-tight text-gray-800">
            US Frame Factory
          </span>
        )}

        <button
          onClick={toggleSidebar}
          className={cn(
            'p-1 rounded-md hover:bg-gray-100 text-gray-500',
            isExpanded ? 'ml-auto' : ''
          )}
        >
          {isExpanded ? (
            <ChevronLeft size={18} />
          ) : (
            <ChevronRight size={18} />
          )}
        </button>
      </div>

      {/* NAV */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname?.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md text-sm font-medium transition-colors',
                isExpanded ? 'px-3 py-2' : 'px-2 py-2 justify-center',
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={!isExpanded ? item.name : undefined}
            >
              <Icon
                size={20}
                className={cn(
                  'flex-shrink-0',
                  isActive ? 'text-white' : 'text-gray-600'
                )}
              />
              {isExpanded && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* FOOTER */}
      <div
        className={cn(
          'border-t border-gray-200 text-xs text-gray-500',
          isExpanded ? 'px-4 py-3 text-left' : 'px-2 py-3 text-center'
        )}
      >
        {isExpanded ? (
          <span>
            <span className="text-indigo-600 font-medium">USFF ERP</span> · Admin
          </span>
        ) : (
          <span className="text-indigo-600 font-medium">A</span>
        )}
      </div>
    </aside>
  );
}