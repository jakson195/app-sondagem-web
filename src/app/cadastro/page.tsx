import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<{ plan?: string }>;
};

export default async function SignupPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const plan = typeof params.plan === "string" ? params.plan : undefined;
  const query = new URLSearchParams({ cadastro: "1" });
  if (plan) query.set("plan", plan);
  redirect(`/login?${query.toString()}`);
}
