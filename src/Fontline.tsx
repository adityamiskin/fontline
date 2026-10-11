"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, PointerEvent } from "react";
import { loadFile, loadScannedFont, loadUrl, starterFonts } from "./font-sources";
import type { FontSource } from "./font-sources";
import type { DiscoveredFont } from "./site-fonts.server";
import { scanWebsiteFonts } from "./site-fonts.functions";
import { Button } from "./components/ui/button";
import { Slider } from "./components/ui/slider";
import { Textarea } from "./components/ui/textarea";
import { Input } from "./components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "./components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

type View = "workbench" | "proof" | "scrub";
type Preset = "headline" | "paragraph" | "pangram" | "numbers" | "custom";

const samples = {
  headline: "Almost before we knew it, we had left the ground.",
  paragraph:
    "Type carries tone before anyone reads a word. Compare the rhythm, texture, and shape of each letter at the size that matters.",
  pangram: "The quick brown fox jumps over the lazy dog.",
  numbers: "0123456789\n$249.00  32%  7/24",
};
const limit = 8;

export function Fontline() {
  const [fonts, setFonts] = useState<FontSource[]>(starterFonts);
  const [leftId, setLeftId] = useState(starterFonts[0].id);
  const [rightId, setRightId] = useState(starterFonts[1].id);
  const [view, setView] = useState<View>("workbench");
  const [preset, setPreset] = useState<Preset>("headline");
  const [sample, setSample] = useState(samples.headline);
  const [size, setSize] = useState(56);
  const [leading, setLeading] = useState(1.08);
  const [tracking, setTracking] = useState(-2);
  const [split, setSplit] = useState(50);
  const [importOpen, setImportOpen] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [familyValue, setFamilyValue] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteResult, setWebsiteResult] = useState<{
    site: string;
    fonts: DiscoveredFont[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const disposers = useRef(new Map<string, () => void>());

  const left = fonts.find((font) => font.id === leftId) ?? fonts[0];
  const right = fonts.find((font) => font.id === rightId) ?? fonts[1];
  const sampleStyle = {
    fontSize: size + "px",
    lineHeight: leading,
    letterSpacing: tracking + "px",
  };

  useEffect(() => {
    const loaded = disposers.current;
    return () => {
      for (const dispose of loaded.values()) dispose();
    };
  }, []);

  function showError(error: unknown) {
    setNotice(error instanceof Error ? error.message : "This font could not be loaded.");
  }

  function addLoaded(font: FontSource, dispose: () => void) {
    disposers.current.set(font.id, dispose);
    setFonts((current) => [...current, font]);
    setRightId(font.id);
    setNotice(font.name + " is ready to compare.");
  }

  async function addFiles(files: File[]) {
    const available = limit - fonts.length;
    if (available <= 0) {
      setNotice("The workspace holds up to eight fonts.");
      return;
    }
    setBusy(true);
    for (const file of files.slice(0, available)) {
      try {
        const loaded = await loadFile(file);
        addLoaded(loaded.font, loaded.dispose);
      } catch (error) {
        showError(error);
      }
    }
    setBusy(false);
    setImportOpen(false);
    if (files.length > available) setNotice("Only " + available + " more fonts could be added.");
  }

  function onFilesChanged(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) void addFiles(files);
  }

  function onFileDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void addFiles(files);
  }

  async function addRemote() {
    if (fonts.length >= limit) {
      setNotice("The workspace holds up to eight fonts.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const loaded = await loadUrl(urlValue.trim(), familyValue.trim());
      addLoaded(loaded.font, loaded.dispose);
      setUrlValue("");
      setFamilyValue("");
      setImportOpen(false);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function scanWebsite() {
    setBusy(true);
    setNotice("");
    try {
      const url = /^https?:\/\//i.test(websiteUrl.trim())
        ? websiteUrl.trim()
        : `https://${websiteUrl.trim()}`;
      const result = await scanWebsiteFonts({ data: { url } });
      setWebsiteResult(result);
      if (result.fonts.length === 0) setNotice("No font files found in this page's CSS.");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function addWebsiteFont(face: DiscoveredFont) {
    if (!websiteResult || fonts.length >= limit) return;
    setBusy(true);
    setNotice("");
    try {
      const loaded = await loadScannedFont(face, websiteResult.site);
      addLoaded(loaded.font, loaded.dispose);
      setImportOpen(false);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  function removeFont(id: string) {
    const dispose = disposers.current.get(id);
    if (!dispose) return;
    dispose();
    disposers.current.delete(id);
    setFonts((current) => current.filter((font) => font.id !== id));
    if (leftId === id) setLeftId(starterFonts[0].id);
    if (rightId === id) setRightId(starterFonts[1].id);
    setNotice("Font removed.");
  }

  function choosePreset(value: Exclude<Preset, "custom">) {
    setPreset(value);
    setSample(samples[value]);
  }

  function moveDivider(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / bounds.width) * 100;
    setSplit(Math.min(95, Math.max(5, position)));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-5 max-[760px]:px-4">
        <a
          href="/"
          className="text-[19px] font-bold tracking-[-.075em] text-foreground no-underline"
          aria-label="Fontline home"
        >
          fontline<span className="text-primary">.</span>
        </a>
      </header>

      <div className="grid min-h-[calc(100vh-56px)] grid-cols-[240px_minmax(0,1fr)] max-[1050px]:grid-cols-[210px_minmax(0,1fr)] max-[760px]:block">
        <aside
          className="relative flex flex-col border-r border-border bg-sidebar p-[18px] max-[760px]:border-r-0 max-[760px]:border-b"
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={onFileDrop}
        >
          {dragging && (
            <div className="absolute inset-1 z-10 grid place-items-center border-2 border-dashed border-primary bg-background/90 font-mono text-xs tracking-widest text-primary">
              DROP TO ADD FONT
            </div>
          )}
          <div className="font-mono text-[10px] font-semibold tracking-[.12em]">COMPARE</div>
          <FieldGroup className="mt-3 gap-0">
            {(
              [
                { letter: "A", font: left, value: leftId, setValue: setLeftId },
                { letter: "B", font: right, value: rightId, setValue: setRightId },
              ] as const
            ).map(({ letter, font, value, setValue }) => (
              <Field
                key={letter}
                orientation="horizontal"
                className="gap-3 border-b border-border py-2.5"
              >
                <FieldLabel htmlFor={`font-${letter.toLowerCase()}`} className="sr-only">
                  Font {letter}
                </FieldLabel>
                <span className="grid size-7 shrink-0 place-items-center bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                  {letter}
                </span>
                <Select
                  items={fonts.map((item) => ({ label: item.name, value: item.id }))}
                  value={value}
                  onValueChange={(id) => {
                    if (typeof id === "string") setValue(id);
                  }}
                >
                  <SelectTrigger
                    id={`font-${letter.toLowerCase()}`}
                    aria-label={`Font ${letter}`}
                    className="h-9 min-w-0 flex-1 text-sm"
                    style={{ fontFamily: font.family }}
                  >
                    <SelectValue placeholder={`Choose font ${letter}`} />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {fonts.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          style={{ fontFamily: item.family }}
                        >
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </FieldGroup>
          <Button
            variant="outline"
            className="mt-4 w-full justify-start"
            disabled={fonts.length >= limit}
            onClick={() => setImportOpen(true)}
          >
            ＋ Add font
          </Button>
          {fonts.some((font) => font.kind !== "system") && (
            <div className="mt-5 border-t border-border pt-2">
              {fonts
                .filter((font) => font.kind !== "system")
                .map((font) => (
                  <div key={font.id} className="flex items-center justify-between gap-2 py-1">
                    <span
                      className="truncate text-xs"
                      style={{ fontFamily: font.family }}
                      title={font.name}
                    >
                      {font.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${font.name}`}
                      onClick={() => removeFont(font.id)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
            </div>
          )}
          <div className="mt-auto pt-8 font-mono text-[10px] tracking-[.07em] text-muted-foreground max-[760px]:hidden">
            Drop WOFF, WOFF2, TTF, or OTF files here
          </div>
        </aside>

        <main className="min-w-0 px-5 pt-5 pb-5 max-[760px]:px-4 max-[760px]:pt-4">
          <div className="border-b border-border pb-4">
            <div
              className="flex w-fit border border-input max-[1050px]:w-full"
              role="group"
              aria-label="Comparison view"
            >
              <button
                className={`border-r border-input px-3 py-2.5 font-mono text-[10px] tracking-[.05em] max-[1050px]:flex-1 ${view === "workbench" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setView("workbench")}
              >
                WORKBENCH
              </button>
              <button
                className={`border-r border-input px-3 py-2.5 font-mono text-[10px] tracking-[.05em] max-[1050px]:flex-1 ${view === "proof" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setView("proof")}
              >
                PROOF SHEET
              </button>
              <button
                className={`px-3 py-2.5 font-mono text-[10px] tracking-[.05em] max-[1050px]:flex-1 ${view === "scrub" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setView("scrub")}
              >
                SCRUB VIEW
              </button>
            </div>
          </div>

          <section className="border-b border-border py-4" aria-label="Specimen controls">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <label
                htmlFor="specimen"
                className="font-mono text-[10px] tracking-[.08em] text-foreground/80"
              >
                SPECIMEN TEXT
              </label>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Text presets">
                {(["headline", "paragraph", "pangram", "numbers"] as const).map((item) => (
                  <button
                    key={item}
                    className={`border px-2 py-1.5 font-mono text-[10px] tracking-[.08em] ${preset === item ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-input hover:text-foreground"}`}
                    onClick={() => choosePreset(item)}
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              id="specimen"
              value={sample}
              rows={2}
              spellCheck={false}
              className="min-h-18 w-full resize-y rounded-none border-input bg-card p-3 text-[15px] leading-[1.35] placeholder:text-muted-foreground"
              onChange={(event) => {
                setSample(event.target.value);
                setPreset("custom");
              }}
              placeholder="Type something to compare…"
            />
            <div className="grid grid-cols-3 gap-5 pt-4 max-[760px]:gap-3 max-[540px]:grid-cols-1">
              <div className="flex min-w-0 flex-col gap-2 max-[540px]:flex-row max-[540px]:items-center">
                <span className="flex justify-between gap-3 font-mono text-[10px] tracking-[.08em] text-muted-foreground max-[540px]:w-[150px] max-[540px]:shrink-0">
                  SIZE <strong className="font-normal text-foreground">{size} PX</strong>
                </span>
                <Slider
                  aria-label="Font size"
                  min={24}
                  max={144}
                  value={[size]}
                  onValueChange={(value) =>
                    setSize(typeof value === "number" ? value : (value[0] ?? size))
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2 max-[540px]:flex-row max-[540px]:items-center">
                <span className="flex justify-between gap-3 font-mono text-[10px] tracking-[.08em] text-muted-foreground max-[540px]:w-[150px] max-[540px]:shrink-0">
                  LINE HEIGHT{" "}
                  <strong className="font-normal text-foreground">{leading.toFixed(2)}</strong>
                </span>
                <Slider
                  aria-label="Line height"
                  min={0.9}
                  max={1.8}
                  step={0.01}
                  value={[leading]}
                  onValueChange={(value) =>
                    setLeading(typeof value === "number" ? value : (value[0] ?? leading))
                  }
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2 max-[540px]:flex-row max-[540px]:items-center">
                <span className="flex justify-between gap-3 font-mono text-[10px] tracking-[.08em] text-muted-foreground max-[540px]:w-[150px] max-[540px]:shrink-0">
                  TRACKING{" "}
                  <strong className="font-normal text-foreground">
                    {tracking > 0 ? "+" : ""}
                    {tracking} PX
                  </strong>
                </span>
                <Slider
                  aria-label="Letter spacing"
                  min={-6}
                  max={12}
                  value={[tracking]}
                  onValueChange={(value) =>
                    setTracking(typeof value === "number" ? value : (value[0] ?? tracking))
                  }
                />
              </div>
            </div>
          </section>

          {view === "workbench" && (
            <section
              className="mt-5 grid min-h-[380px] grid-cols-2 border border-border bg-card max-[760px]:grid-cols-1"
              aria-label="Side by side comparison"
            >
              {[left, right].map((font, index) => (
                <article
                  className={`flex min-w-0 flex-col p-5 max-[760px]:min-h-[340px] ${index === 0 ? "border-r border-border max-[760px]:border-r-0 max-[760px]:border-b" : ""}`}
                  key={index + "-" + font.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="font-mono text-[10px] tracking-[.08em] text-muted-foreground">
                        {index === 0 ? "A" : "B"}
                      </span>
                      <h2
                        className="mt-2 text-[18px] font-normal tracking-[-.045em]"
                        style={{ fontFamily: font.family }}
                      >
                        {font.name}
                      </h2>
                    </div>
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  </div>
                  <div
                    className="mt-7 flex-1 whitespace-pre-wrap break-words"
                    style={{ ...sampleStyle, fontFamily: font.family }}
                  >
                    {sample || "Your text appears here."}
                  </div>
                </article>
              ))}
            </section>
          )}

          {view === "proof" && (
            <section
              className="mt-[26px] border border-border bg-card px-[25px] pt-6 pb-3 max-[760px]:px-3 max-[760px]:py-[15px]"
              aria-label="Proof sheet comparison"
            >
              <div className="grid grid-cols-[110px_repeat(2,minmax(0,1fr))] gap-4 py-4 font-mono text-[10px] tracking-[.08em] text-foreground/80 max-[760px]:grid-cols-[60px_repeat(2,minmax(0,1fr))] max-[760px]:gap-[7px] max-[540px]:text-[9px]">
                <span className="text-muted-foreground">SCALE</span>
                <span>A / {left.name}</span>
                <span>B / {right.name}</span>
              </div>
              {[
                { label: "DISPLAY", scale: size },
                { label: "HEADING", scale: Math.max(26, Math.round(size * 0.53)) },
                { label: "BODY", scale: Math.max(16, Math.round(size * 0.24)) },
              ].map(({ label, scale }) => (
                <div
                  className="grid grid-cols-[110px_repeat(2,minmax(0,1fr))] gap-4 border-t border-border py-5 max-[760px]:grid-cols-[60px_repeat(2,minmax(0,1fr))] max-[760px]:gap-[7px]"
                  key={label}
                >
                  <div className="pt-1 font-mono text-[10px] leading-[1.5] tracking-[.08em] text-muted-foreground">
                    {scale} PX
                    <br />
                    {label}
                  </div>
                  {[left, right].map((font, index) => (
                    <div
                      className="min-w-0 whitespace-pre-wrap break-words"
                      key={label + index}
                      style={{
                        fontFamily: font.family,
                        fontSize: scale + "px",
                        lineHeight: leading,
                        letterSpacing: (tracking * scale) / size + "px",
                      }}
                    >
                      {sample || "Your text appears here."}
                    </div>
                  ))}
                </div>
              ))}
              <div className="grid grid-cols-[110px_repeat(2,minmax(0,1fr))] gap-4 border-t border-border py-5 max-[760px]:grid-cols-[60px_repeat(2,minmax(0,1fr))] max-[760px]:gap-[7px]">
                <div className="pt-1 font-mono text-[10px] leading-[1.5] tracking-[.08em] text-muted-foreground">
                  GLYPHS
                </div>
                {[left, right].map((font, index) => (
                  <div
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-[18px] max-[540px]:text-[12px]"
                    key={index}
                    style={{ fontFamily: font.family }}
                  >
                    Aa Bb Cc Dd Ee Ff Gg Hh 0123456789
                  </div>
                ))}
              </div>
            </section>
          )}

          {view === "scrub" && (
            <section
              className="mt-[26px] border border-border bg-card p-[20px_23px] max-[760px]:p-3"
              aria-label="Overlay comparison"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-5 font-mono text-[10px] tracking-[.08em]">
                <span>
                  <b className="text-[13px] font-normal tracking-normal">{left.name}</b>{" "}
                  <i className="px-3 text-muted-foreground not-italic">VERSUS</i>{" "}
                  <b className="text-[13px] font-normal tracking-normal">{right.name}</b>
                </span>
              </div>
              <div
                className="relative h-[470px] cursor-col-resize touch-none select-none overflow-hidden border border-border bg-card max-[760px]:h-[390px]"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  moveDivider(event);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) moveDivider(event);
                }}
              >
                <div
                  className="absolute inset-0 bg-card"
                  style={{ clipPath: "inset(0 " + (100 - split) + "% 0 0)" }}
                >
                  <div className="h-full w-full overflow-hidden p-11 max-[760px]:p-[25px_18px]">
                    <span className="font-mono text-[10px] tracking-[.08em] text-muted-foreground">
                      A / {left.name.toUpperCase()}
                    </span>
                    <div
                      className="mt-10 whitespace-pre-wrap break-words max-[760px]:!text-[min(var(--scrub-size,72px),58px)]"
                      style={{ ...sampleStyle, fontFamily: left.family }}
                    >
                      {sample || "Your text appears here."}
                    </div>
                  </div>
                </div>
                <div
                  className="absolute inset-0 bg-card"
                  style={{ clipPath: "inset(0 0 0 " + split + "%)" }}
                >
                  <div className="h-full w-full overflow-hidden p-11 max-[760px]:p-[25px_18px]">
                    <span className="font-mono text-[10px] tracking-[.08em] text-muted-foreground">
                      B / {right.name.toUpperCase()}
                    </span>
                    <div
                      className="mt-10 whitespace-pre-wrap break-words max-[760px]:!text-[min(var(--scrub-size,72px),58px)]"
                      style={{ ...sampleStyle, fontFamily: right.family }}
                    >
                      {sample || "Your text appears here."}
                    </div>
                  </div>
                </div>
                <div
                  className="absolute top-0 bottom-0 z-10 w-[2px] bg-primary"
                  style={{ left: split + "%" }}
                  aria-hidden="true"
                >
                  <span className="absolute top-1/2 left-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-xl text-primary-foreground">
                    ↔
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-5 pt-5 font-mono text-[10px] tracking-[.08em] text-muted-foreground">
                <span>FONT A</span>
                <input
                  aria-label="Comparison divider"
                  className="w-full accent-primary"
                  type="range"
                  min="5"
                  max="95"
                  value={split}
                  onChange={(event) => setSplit(Number(event.target.value))}
                />
                <span>FONT B</span>
              </div>
            </section>
          )}
        </main>
      </div>

      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept=".woff,.woff2,.ttf,.otf"
        multiple
        onChange={onFilesChanged}
      />
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Add a font</DialogTitle>
            <DialogDescription className="sr-only">
              Upload a font file, load a font URL, or scan a website for fonts.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="website">
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="website">Website</TabsTrigger>
              <TabsTrigger value="file">Font file</TabsTrigger>
              <TabsTrigger value="url">Font URL</TabsTrigger>
            </TabsList>
            <TabsContent value="website" className="pt-4">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void scanWebsite();
                }}
              >
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="website-url">Website URL</FieldLabel>
                    <Input
                      id="website-url"
                      type="text"
                      inputMode="url"
                      value={websiteUrl}
                      onChange={(event) => {
                        setWebsiteUrl(event.target.value);
                        setWebsiteResult(null);
                      }}
                      placeholder="https://example.com/page"
                    />
                  </Field>
                </FieldGroup>
                <Button type="submit" className="mt-3 w-full" disabled={busy || !websiteUrl.trim()}>
                  {busy ? "SCANNING…" : "SCAN WEBSITE"}
                </Button>
              </form>
              {websiteResult && websiteResult.fonts.length > 0 && (
                <div className="mt-5 border-t border-border pt-3">
                  <div className="mb-2 flex items-center justify-between font-mono text-[10px] tracking-[.08em] text-muted-foreground">
                    <span>FONTS ON {websiteResult.site.toUpperCase()}</span>
                    <span>{websiteResult.fonts.length}</span>
                  </div>
                  {websiteResult.fonts.map((face) => {
                    const added = fonts.some((font) => font.sourceUrl === face.url);
                    return (
                      <div
                        key={`${face.family}|${face.style}|${face.weight}|${face.url}`}
                        className="flex items-center justify-between gap-3 border-b border-border py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm">{face.family}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {face.style !== "normal" ? `${face.style} · ` : ""}
                            {face.weight.replace(" ", "–")}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || added || fonts.length >= limit}
                          aria-label={`Add ${face.family} ${face.style} ${face.weight}`}
                          onClick={() => void addWebsiteFont(face)}
                        >
                          {added ? "ADDED" : "ADD"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
            <TabsContent value="file" className="pt-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>WOFF, WOFF2, TTF, or OTF</FieldLabel>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => fileInput.current?.click()}
                    disabled={busy}
                  >
                    CHOOSE FILES <span>↗</span>
                  </Button>
                </Field>
              </FieldGroup>
            </TabsContent>
            <TabsContent value="url" className="pt-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="font-url">Font or stylesheet URL</FieldLabel>
                  <Input
                    id="font-url"
                    type="url"
                    value={urlValue}
                    onChange={(event) => setUrlValue(event.target.value)}
                    placeholder="https://example.com/font.woff2"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="font-family">Font family for CSS URLs</FieldLabel>
                  <Input
                    id="font-family"
                    value={familyValue}
                    onChange={(event) => setFamilyValue(event.target.value)}
                    placeholder="Optional for direct font files"
                  />
                </Field>
              </FieldGroup>
              <Button
                className="mt-4 w-full"
                onClick={() => void addRemote()}
                disabled={busy || !urlValue.trim()}
              >
                {busy ? "LOADING…" : "LOAD FONT"}
              </Button>
            </TabsContent>
          </Tabs>
          {notice && (
            <div className="mt-4 text-[13px] text-primary" role="status">
              {notice}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {notice && !importOpen && (
        <div
          className="fixed right-5 bottom-5 z-40 flex max-w-[400px] items-start gap-5 border border-input bg-background px-4 py-3 text-[13px]"
          role="status"
        >
          <span>{notice}</span>
          <button
            className="-mt-1 text-xl text-muted-foreground"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
