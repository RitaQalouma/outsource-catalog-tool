'use client';

import type { ReactNode } from "react";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { cn } from "@/lib/utils";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="min-h-dvh bg-gray-50">
      <Sidebar
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
<main className={cn('h-dvh overflow-y-auto transition-all duration-300', isExpanded ? 'ml-64' : 'ml-14')}>

    
      
        {children}
      </main>
    </div>
  );
}