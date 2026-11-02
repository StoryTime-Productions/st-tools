"use client";

import { useRef, useState } from "react";
import { MoreHorizontal, Settings2 } from "lucide-react";
import { HangoutDialog } from "@/app/hub/_components/hangout-dialog";
import { ManageInitiativesDialog } from "@/app/hub/_components/manage-initiatives-dialog";
import { NewProjectDialog } from "@/app/hub/_components/new-project-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InitiativeOption } from "@/lib/hub";

/**
 * The admin row above the overview. On phones the two creates stay visible and the rarely used
 * "Manage initiatives" moves into a menu; from md up it is a plain button between them. Both entry
 * points open the one dialog, which lives out here so it survives the menu closing.
 */
export function HubAdminActions({ initiatives }: { initiatives: InitiativeOption[] }) {
  const [initiativesOpen, setInitiativesOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex items-center gap-2 md:flex-wrap md:justify-end">
      <div className="max-md:flex-1 max-md:[&_button]:w-full">
        <HangoutDialog />
      </div>
      <Button
        type="button"
        variant="outline"
        className="max-md:hidden"
        onClick={(event) => {
          opener.current = event.currentTarget;
          setInitiativesOpen(true);
        }}
      >
        Manage initiatives
      </Button>
      <div className="max-md:flex-1 max-md:[&_button]:w-full">
        <NewProjectDialog initiatives={initiatives} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={moreTrigger}
            type="button"
            variant="outline"
            size="icon"
            className="md:hidden"
            aria-label="More admin actions"
            title="More admin actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              opener.current = moreTrigger.current;
              setInitiativesOpen(true);
            }}
          >
            <Settings2 className="size-4" />
            Manage initiatives
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ManageInitiativesDialog
        initiatives={initiatives}
        open={initiativesOpen}
        onOpenChange={setInitiativesOpen}
        onCloseAutoFocus={(event) => {
          if (opener.current?.isConnected) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
      />
    </div>
  );
}
