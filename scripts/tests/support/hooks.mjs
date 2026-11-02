// Redireciona "@supabase/supabase-js" para o banco falso (os testes não precisam instalar nada).
const fake = new URL("./fake-supabase.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@supabase/supabase-js") return { url: fake, shortCircuit: true };
  return nextResolve(specifier, context);
}
