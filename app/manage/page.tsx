import { ManageClient } from "@/components/ManageClient";
import { getStorageInfo, readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manage internships — Internship Compass",
};

export default async function ManagePage() {
  const db = await readDb();

  return (
    <ManageClient
      internships={db.internships}
      taxonomies={db.taxonomies}
      candidates={db.candidates}
      storage={getStorageInfo()}
    />
  );
}
