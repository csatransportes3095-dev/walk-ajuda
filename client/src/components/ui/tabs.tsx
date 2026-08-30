import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const SPREADSHEET_MODULE_GRID_CSS = `
#planilha-modulos {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

#planilha-modulos > [data-slot="tabs"] {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

#planilha-modulos .spreadsheet-module-strip {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  height: auto !important;
  align-items: stretch !important;
  justify-items: stretch !important;
  justify-content: stretch !important;
  gap: 10px !important;
}

#planilha-modulos .spreadsheet-module-strip > * {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  margin: 0 !important;
  flex: none !important;
}

@media (min-width: 640px) {
  #planilha-modulos .spreadsheet-module-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 12px !important;
  }
}

@media (min-width: 768px) {
  #planilha-modulos .spreadsheet-module-strip {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  }
}

@media (min-width: 1280px) {
  #planilha-modulos .spreadsheet-module-strip {
    grid-template-columns: repeat(9, minmax(0, 1fr)) !important;
  }
}
`;

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const isSpreadsheetModuleStrip = className?.includes("spreadsheet-module-strip");

  return (
    <>
      {isSpreadsheetModuleStrip && <style>{SPREADSHEET_MODULE_GRID_CSS}</style>}
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(
          "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
          className
        )}
        {...props}
      />
    </>
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
