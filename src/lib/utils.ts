import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Prefixo da subpasta onde o site é publicado (ex.: "/Blog"); "" quando está na raiz do domínio. */
export function basePath(): string {
  return import.meta.env.BASE_URL.replace(/\/+$/, "");
}

/**
 * Caminho público respeitando a subpasta. Use em <a href> "crus" e em arquivos de /public
 * (os <Link> do roteador já cuidam disso sozinhos). Ex.: withBase("favicon.ico") → "/Blog/favicon.ico".
 */
export function withBase(path: string): string {
  return `${basePath()}/${path.replace(/^\/+/, "")}`;
}

/**
 * Endereço público do site, sem barra final. Em subpasta, garante o sufixo (ex.: "/Blog")
 * mesmo que só o domínio tenha sido digitado em "Endereço do site".
 */
export function siteOrigin(siteUrl: string): string {
  const url = siteUrl.trim().replace(/\/+$/, "");
  const base = basePath();
  if (!url || !base) return url;
  return url.toLowerCase().endsWith(base.toLowerCase()) ? url : url + base;
}
