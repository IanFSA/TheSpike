import CueBoard from "@/app/components/CueBoard";
import { isAuthenticated } from "@/app/lib/auth";

export default async function Home() {
  return <CueBoard initialAuthenticated={await isAuthenticated()} />;
}
