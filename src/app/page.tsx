import Chat from "@/components/Chat";
import { EPHEMERAL_STORAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Chat ephemeral={EPHEMERAL_STORAGE} />;
}
