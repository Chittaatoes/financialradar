import { useIsMobile } from "@/hooks/use-mobile";
import { AddActionDesktop } from "./add-action-desktop";
import { AddActionMobile } from "./add-action-mobile";

interface Props {
  onSelectAction: (action: string) => void;
}

export function AddAction({ onSelectAction }: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <AddActionMobile onSelectAction={onSelectAction} />;
  }

  return <AddActionDesktop onSelectAction={onSelectAction} />;
}
