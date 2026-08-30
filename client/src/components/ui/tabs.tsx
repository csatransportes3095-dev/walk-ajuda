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
  const [modulesExpanded, setModulesExpanded] = React.useState(true);

  React.useEffect(() => {
    if (!isSpreadsheetModuleStrip || typeof window === "undefined") return;
    setModulesExpanded(!window.matchMedia("(max-width: 767px)").matches);
  }, [isSpreadsheetModuleStrip]);

  if (isSpreadsheetModuleStrip) {
    return (
      <>
        <style>{SPREADSHEET_MODULE_GRID_CSS}</style>
        <div className="mb-5 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 shadow-[0_12px_34px_rgba(0,0,0,.22)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setModulesExpanded((expanded) => !expanded)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            aria-expanded={modulesExpanded}
            aria-controls="spreadsheet-module-list"
          >
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-[0.10em] text-white">
                Módulos da planilha
              </p>
              <p className="mt-0.5 text-xs font-medium text-white/55">
                {modulesExpanded ? "Toque para recolher" : "Toque para ver os serviços"}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/80">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn("h-5 w-5 transition-transform duration-200", modulesExpanded && "rotate-180")}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>

          {modulesExpanded && (
            <div id="spreadsheet-module-list" className="px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
              <TabsPrimitive.List
                data-slot="tabs-list"
                className={cn(
                  "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
                  className,
                  "!mb-0"
                )}
                {...props}
              />
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
      {...props}
    />
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
