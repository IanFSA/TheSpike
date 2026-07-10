import { redirect } from "next/navigation";
import { isAuthenticated } from "@/app/lib/auth";
import TrafficBoard from "@/app/traffic/TrafficBoard";

export const dynamic = "force-dynamic";

export default async function TrafficPage() {
  if (!(await isAuthenticated())) redirect("/");
  return <TrafficBoard />;
}
