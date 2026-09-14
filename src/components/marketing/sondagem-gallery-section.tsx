import Image from "next/image";
import Link from "next/link";
import {
  SONDAGEM_GALLERY_IMAGES,
  type SondagemGalleryItem,
  type SondagemGalleryTag,
} from "@/lib/marketing/sondagem-gallery";

const TAG_COLORS: Record<SondagemGalleryTag, string> = {
  SPT: "bg-[var(--dg-cyan)]/20 text-[var(--dg-cyan)] border-[var(--dg-cyan)]/30",
  Trado: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Rotativa: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Poços: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Campo: "bg-[var(--dg-blue)]/15 text-[var(--dg-blue)] border-[var(--dg-blue)]/30",
  Relatório: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

function GalleryCard({ item }: { item: SondagemGalleryItem }) {
  const featured = item.featured === true;

  return (
    <figure
      className={`group relative overflow-hidden rounded-2xl border border-[var(--dg-border)] bg-[var(--dg-card)] ${
        featured ? "sm:row-span-2" : ""
      }`}
    >
      <div className={`relative w-full ${featured ? "aspect-[4/5] sm:min-h-full sm:h-full" : "aspect-[4/3]"}`}>
        <Image
          src={item.src}
          alt={item.alt}
          fill
          unoptimized
          sizes={featured ? "(max-width: 640px) 100vw, 50vw" : "(max-width: 640px) 100vw, 33vw"}
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--dg-black)] via-[var(--dg-black)]/20 to-transparent" />
        <span
          className={`absolute left-3 top-3 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TAG_COLORS[item.tag]}`}
        >
          {item.tag}
        </span>
      </div>
      <figcaption className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <p className="text-sm font-medium leading-snug text-[var(--dg-text)]">{item.caption}</p>
      </figcaption>
    </figure>
  );
}

export function SondagemGallerySection() {
  return (
    <section id="galeria-sondagens" className="scroll-mt-24 border-y border-[var(--dg-border)] bg-[#0a0d12]/80 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--dg-cyan)]">
              Campo & escritório
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Sondagem em imagens
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--dg-muted)] sm:text-base">
              Mostre o trabalho de campo — SPT, trado, rotativa, poços e relatórios — na
              página comercial. Substitua as fotos de exemplo pelas suas em{" "}
              <code className="rounded bg-[var(--dg-border)] px-1.5 py-0.5 text-xs text-[var(--dg-cyan)]">
                public/marketing/sondagens/
              </code>{" "}
              e edite{" "}
              <code className="rounded bg-[var(--dg-border)] px-1.5 py-0.5 text-xs text-[var(--dg-cyan)]">
                src/lib/marketing/sondagem-gallery.ts
              </code>
              .
            </p>
          </div>
          <Link
            href="/funcionalidades"
            className="shrink-0 text-sm font-medium text-[var(--dg-blue)] underline-offset-4 hover:underline"
          >
            Ver módulos de sondagem →
          </Link>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2">
          {SONDAGEM_GALLERY_IMAGES.map((item) => (
            <GalleryCard key={item.id} item={item} />
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-[var(--dg-muted)]">
          Dica: use ficheiros com nomes curtos (ex.{" "}
          <span className="text-[var(--dg-text)]">obra-12-spt.jpg</span>) e{" "}
          <span className="text-[var(--dg-text)]">src: &quot;/marketing/sondagens/obra-12-spt.jpg&quot;</span>
        </p>
      </div>
    </section>
  );
}
