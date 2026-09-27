import { RecruitClient } from "@/components/RecruitClient";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rank candidates — Internship Compass",
};

export default async function RecruitPage() {
  const db = await readDb();

  return (
    <RecruitClient
      internships={db.internships}
      taxonomies={db.taxonomies}
      candidates={db.candidates}
    />
  );
}
