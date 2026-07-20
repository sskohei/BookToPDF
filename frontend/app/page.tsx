import { AppHeader } from "@/components/AppHeader";
import { Capture } from "@/components/Capture";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <AppHeader />
      <Capture />
    </main>
  );
}
