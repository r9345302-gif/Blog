/**
 * Restaura um backup (feito por scripts/backup.ts) no banco do Supabase. Recria o que sumiu e corrige o que mudou;
 * NÃO apaga linhas que existam a mais. Não restaura a chave do Gemini (ela nunca entra no backup).
 *
 * Uso (pelo GitHub: Actions → "Restaurar backup"; ou local):
 *   RESTORE_FILE=2026-10-25T03-23-00-000Z.json.gz DRY_RUN=true  node --experimental-strip-types scripts/restore.ts   # só conferir
 *   RESTORE_FILE=2026-10-25T03-23-00-000Z.json.gz CONFIRM_RESTORE=RESTAURAR node --experimental-strip-types scripts/restore.ts
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Os nomes dos backups aparecem em Supabase → Storage → backups.
 */
import { loadBackup, restoreBackup } from "./backup.ts";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const file = process.env.RESTORE_FILE || process.argv[2];
  const dryRun = /^(1|true|sim)$/i.test(process.env.DRY_RUN ?? "") || process.argv.includes("--dry-run");
  if (!url || !key) {
    console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
    process.exit(1);
  }
  if (!file) {
    console.error("Informe o arquivo: RESTORE_FILE=<nome do backup> (veja Supabase → Storage → backups).");
    process.exit(1);
  }
  if (!dryRun && process.env.CONFIRM_RESTORE !== "RESTAURAR") {
    console.error('Para restaurar de verdade, defina CONFIRM_RESTORE=RESTAURAR (ou use DRY_RUN=true para só conferir).');
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const backup = await loadBackup(db, file);
  console.log(`Backup de ${backup.created_at} aberto.`);
  const done = await restoreBackup(db, backup, { dryRun });
  console.log(`${dryRun ? "Conferência (nada foi alterado)" : "Restauração concluída"}. Linhas por tabela: ${JSON.stringify(done)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
