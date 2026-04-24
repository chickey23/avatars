import { getRosterScore } from "../services/avatarRoster";
import { AvatarBuilderModal } from "../components/AvatarBuilderModal";
import { SessionLogPanel } from "../components/SessionLogPanel";
import { useAppContentView } from "./appContentViewContext";

export function AppOverlays() {
  const m = useAppContentView();
  return (
    <>
      {m.sessionLogOpen && (
        <SessionLogPanel
          diskLogDir={m.sessionDiskInfo?.logDir ?? null}
          onClose={() => m.setSessionLogOpen(false)}
        />
      )}
      <AvatarBuilderModal
        open={m.avatarBuilderOpen}
        onClose={() => {
          m.setAvatarBuilderOpen(false);
          m.setAvatarBuilderInitial(null);
        }}
        initial={m.avatarBuilderInitial}
        initialRosterScore={
          m.avatarBuilderInitial?.kind === "edit"
            ? getRosterScore(
                m.situationContext.avatarRosterPriorityScoreById,
                m.avatarBuilderInitial.avatar.id
              )
            : undefined
        }
        existingUserAvatars={m.situationContext.userAvatars ?? []}
        onSave={m.handleAvatarBuilderSave}
        openPortraitFilePicker={m.openPortraitFilePicker}
        clearPortrait={m.clearPortrait}
        portraitFileError={m.portraitFileError}
        avatarPortraitSrcById={m.situationContext.avatarPortraitSrcById}
      />
    </>
  );
}
