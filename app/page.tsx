import { Explorer } from "@/components/Explorer";
import { getStorageInfo, readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = await readDb();

  return (
    <Explorer
      internships={db.internships}
      taxonomies={db.taxonomies}
      candidates={db.candidates}
      storage={getStorageInfo()}
    />
  );
}
