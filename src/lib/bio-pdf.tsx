/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> is not an HTML image and has no alt prop */
import "server-only";
import path from "path";
import { Circle, Defs, Document, Font, Image, type Styles, LinearGradient, Line, Page, Path, Rect, Stop, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { TrainerProfile } from "./scoring";
import { pdfText } from "./pdf-text";

// Layout follows the approved "Meska Trainer Bio" one-pager: navy header with photo,
// left column (overview, credentials), right column (footprint, expertise, thought leadership).

const fonts = path.join(process.cwd(), "src/fonts");
Font.register({ family: "Merriweather", src: path.join(fonts, "merriweather-latin-700-normal.ttf"), fontWeight: 700 });
Font.register({
  family: "DM Sans",
  fonts: [
    { src: path.join(fonts, "dm-sans-latin-400-normal.ttf"), fontWeight: 400 },
    { src: path.join(fonts, "dm-sans-latin-500-normal.ttf"), fontWeight: 500 },
    { src: path.join(fonts, "dm-sans-latin-700-normal.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

const NAVY = "#0B1E3A";
const INK = "#0F2747";
const BODY = "#33415C";
const BLUE = "#2563EB";
const CARD = "#F7F9FC";
const W = 960;
const H = 540;

type Group = { label: string; text: string };

const lines = (s: string | null | undefined) => (s ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const groups = (s: string | null | undefined): Group[] =>
  lines(s).map((l) => {
    const i = l.indexOf(":");
    return i > 0 ? { label: l.slice(0, i).trim(), text: l.slice(i + 1).trim() } : { label: "", text: l };
  });

// **bold** markers → nested bold Text
type Style = Styles[string];

function Rich({ text, style }: { text: string; style: Style }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        /^\*\*[^*]+\*\*$/.test(p) ? (
          <Text key={i} style={{ fontWeight: 700, color: INK }}>{p.slice(2, -2)}</Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

type IconName = "user" | "globe" | "cap" | "gears" | "mic";
function Icon({ name }: { name: IconName }) {
  const c = BLUE;
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" style={{ marginRight: 7 }}>
      {name === "user" && (
        <>
          <Circle cx="12" cy="7" r="4.5" fill={c} />
          <Path d="M3.5 22c0-5 3.8-8.5 8.5-8.5s8.5 3.5 8.5 8.5z" fill={c} />
        </>
      )}
      {name === "globe" && (
        <>
          <Circle cx="12" cy="12" r="10" fill={c} />
          <Path d="M2 12h20M12 2c3 3 4 6.5 4 10s-1 7-4 10c-3-3-4-6.5-4-10s1-7 4-10z" stroke="#FFFFFF" strokeWidth={1.4} fill="none" />
        </>
      )}
      {name === "cap" && (
        <>
          <Path d="M12 3 1 8.5 12 14l9-4.5V16h2V8.5z" fill={c} />
          <Path d="M5.5 12v4.5c0 1.8 3 3.5 6.5 3.5s6.5-1.7 6.5-3.5V12L12 15.3z" fill={c} />
        </>
      )}
      {name === "gears" && (
        <>
          <Circle cx="9" cy="10" r="6.5" fill={c} />
          <Circle cx="9" cy="10" r="2.4" fill="#FFFFFF" />
          <Circle cx="18" cy="17.5" r="4.5" fill={c} />
          <Circle cx="18" cy="17.5" r="1.7" fill="#FFFFFF" />
        </>
      )}
      {name === "mic" && (
        <>
          <Rect x="8" y="2" width="8" height="13" rx="4" fill={c} />
          <Path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" stroke={c} strokeWidth={2} fill="none" />
        </>
      )}
    </Svg>
  );
}

function Card({ icon, title, children, style }: { icon: IconName; title: string; children: React.ReactNode; style?: Style }) {
  return (
    <View style={{ backgroundColor: CARD, borderLeftWidth: 3, borderLeftColor: BLUE, paddingVertical: 12, paddingHorizontal: 13, ...style }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingBottom: 5, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "#DCE3EE" }}>
        <Icon name={icon} />
        <Text style={{ fontFamily: "Merriweather", fontWeight: 700, fontSize: 15.5, color: INK }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const body: Style = { fontFamily: "DM Sans", fontSize: 10.6, color: BODY, lineHeight: 1.55 };
const label: Style = { fontFamily: "DM Sans", fontWeight: 700, fontSize: 10, color: INK, marginBottom: 1.5 };

function GroupList({ items, size = 9.6 }: { items: Group[]; size?: number }) {
  return (
    <>
      {items.map((g, i) => (
        <View key={i} style={{ marginBottom: 8 }}>
          {g.label ? <Text style={label}>{g.label}:</Text> : null}
          <Text style={{ ...body, fontSize: size, lineHeight: 1.45 }}>{g.text}</Text>
        </View>
      ))}
    </>
  );
}

// Long names shrink so they stay on one line inside the header band.
const nameSize = (name: string) => (name.length > 30 ? Math.max(20, Math.round((33 * 30) / name.length)) : 33);

export type BioInput = { t: TrainerProfile; photo: Buffer | null };

function BioDoc({ t, photo }: BioInput) {
  const overview = t.overview ? t.overview.split(/\r?\n\s*\r?\n/).map((p) => p.replace(/\s*\r?\n\s*/g, " ").trim()).filter(Boolean) : [];
  if (!overview.length) {
    const tags = (k: string) => t.lookups.filter((l) => l.kind === k).map((l) => l.name);
    overview.push(`Meska AI trainer specialised in **${t.skills.map((s) => s.name).join(", ") || "AI for business"}**.`);
    // only when there is something to say, otherwise the paragraph would be a lone "."
    const reach = [tags("audience").length && `Delivers to ${tags("audience").join(", ")} audiences`, tags("function").length && `across ${tags("function").join(", ")} functions`].filter(Boolean);
    if (reach.length) overview.push(reach.join(" ") + ".");
  }
  const credentials = lines(t.credentials);
  const footprint = groups(t.footprint);
  const footprintIntro = t.footprint_intro || (t.delivered ? `Delivered ${t.delivered}+ trainings with Meska AI${t.feedback.average ? `, rated ${t.feedback.average.toFixed(2)}/5 by participants` : ""}.` : "");
  let expertise = groups(t.expertise);
  if (!expertise.length) {
    const ind = t.lookups.filter((l) => l.kind === "industry").map((l) => l.name);
    expertise = [
      ...(ind.length ? [{ label: "Industries", text: ind.join(", ") }] : []),
      ...(t.skills.length ? [{ label: "Training topics", text: t.skills.map((s) => s.name).join(", ") }] : []),
    ];
  }
  const thought = t.thought_leadership?.trim();

  return (
    <Document title={`Meska Trainer Bio - ${t.full_name}`} author="Meska AI">
      <Page size={[W, H]} style={{ fontFamily: "DM Sans", backgroundColor: "#FFFFFF" }}>
        {/* Header band */}
        <View style={{ height: 128, position: "relative" }}>
          <Svg width={W} height={128} style={{ position: "absolute", top: 0, left: 0 }}>
            <Defs>
              <LinearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#061529" />
                <Stop offset="1" stopColor="#0B2A57" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={W} height={128} fill="url(#hdr)" />
            <Line x1="0" y1="126" x2={W} y2="126" stroke={BLUE} strokeWidth={4} />
          </Svg>
          <View style={{ position: "absolute", left: 52, top: 7, width: 116, height: 116, borderRadius: 58, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
            {photo ? (
              <Image src={photo} style={{ width: 112, height: 112, borderRadius: 56, objectFit: "cover" }} />
            ) : (
              <Text style={{ fontFamily: "Merriweather", fontWeight: 700, fontSize: 34, color: NAVY }}>
                {t.full_name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("")}
              </Text>
            )}
          </View>
          <View style={{ position: "absolute", left: 210, top: 22, right: 40 }}>
            <Text style={{ fontFamily: "Merriweather", fontWeight: 700, fontSize: nameSize(t.full_name), color: "#FFFFFF" }}>{t.full_name}</Text>
            {t.title ? <Text style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 15, color: "#FFFFFF", marginTop: 8 }}>{t.title}</Text> : null}
            {t.email ? <Text style={{ fontFamily: "DM Sans", fontSize: 11.5, color: "#93C5FD", marginTop: 6 }}>{t.email}</Text> : null}
          </View>
        </View>

        {/* Body */}
        <View style={{ flexDirection: "row", paddingHorizontal: 45, paddingTop: 15, gap: 14 }}>
          <View style={{ width: 285, gap: 13 }}>
            <Card icon="user" title="Professional Overview">
              {overview.map((p, i) => (
                <Rich key={i} text={p} style={{ ...body, marginBottom: i < overview.length - 1 ? 6 : 0 }} />
              ))}
            </Card>
            {credentials.length > 0 && (
              <Card icon="cap" title="Educational Credentials">
                {credentials.map((c, i) => (
                  <View key={i} style={{ flexDirection: "row", marginBottom: 7 }}>
                    <Text style={{ ...label, fontSize: 10.6, color: BLUE, marginRight: 8 }}>•</Text>
                    <Text style={{ ...label, fontSize: 10.6 }}>{c}</Text>
                  </View>
                ))}
              </Card>
            )}
          </View>

          <View style={{ flex: 1, gap: 13 }}>
            {(footprintIntro || footprint.length > 0) && (
              <Card icon="globe" title="Extensive Training Footprint">
                {footprintIntro ? <Text style={{ ...body, fontSize: 9.8, marginBottom: 8 }}>{footprintIntro}</Text> : null}
                <GroupList items={footprint} />
              </Card>
            )}
            <View style={{ flexDirection: "row", gap: 9 }}>
              {expertise.length > 0 && (
                <Card icon="gears" title="Industry Expertise" style={{ flex: 1 }}>
                  <GroupList items={expertise} />
                </Card>
              )}
              {thought && (
                <Card icon="mic" title="Thought Leadership" style={{ flex: 1 }}>
                  <Rich text={thought} style={body} />
                </Card>
              )}
            </View>
          </View>
        </View>

        <Text style={{ position: "absolute", right: 48, bottom: 14, fontFamily: "Merriweather", fontWeight: 700, fontSize: 10, color: NAVY, letterSpacing: 1 }}>MESKA.AI</Text>
      </Page>
    </Document>
  );
}

export function renderBioPdf(input: BioInput) {
  const t = input.t;
  const clean = (s: string | null) => (s == null ? s : pdfText(s));
  // every piece of profile text the PDF prints goes through the font-coverage filter
  const safe: TrainerProfile = {
    ...t,
    full_name: pdfText(t.full_name).trim() || "Meska trainer",
    title: clean(t.title),
    email: clean(t.email),
    phone: clean(t.phone),
    overview: clean(t.overview),
    credentials: clean(t.credentials),
    footprint_intro: clean(t.footprint_intro),
    footprint: clean(t.footprint),
    expertise: clean(t.expertise),
    thought_leadership: clean(t.thought_leadership),
    skills: t.skills.map((s) => ({ ...s, name: pdfText(s.name) })),
    lookups: t.lookups.map((l) => ({ ...l, name: pdfText(l.name) })),
  };
  return renderToBuffer(<BioDoc {...input} t={safe} />);
}
