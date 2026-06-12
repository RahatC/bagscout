import { useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  Search,
  Check,
  Sparkles,
  Mail,
  Calendar,
  CalendarDays,
  Bell,
  Target,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useCreateBagPreference,
  useListBrands,
  useListStyles,
  useListColors,
  useListConditions,
  useListSizes,
  getListBagPreferencesQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type AlertFrequency = "instant" | "daily" | "weekly" | "later";
type ApiAlertFrequency = "realtime" | "daily" | "weekly";

interface FormState {
  brandIds: number[];
  styleIds: number[];
  exactModelEnabled: boolean | null;
  modelQuery: string;
  conditionMinId: number | null;
  colorIds: number[];
  allowCloseColorMatch: boolean;
  sizeIds: number[];
  customSize: string;
  minPrice: string;
  maxPrice: string;
  matchMode: "exact" | "smart" | null;
  onlyExactCriteria: boolean;
  alertFrequency: AlertFrequency | null;
}

const initialState: FormState = {
  brandIds: [],
  styleIds: [],
  exactModelEnabled: null,
  modelQuery: "",
  conditionMinId: null,
  colorIds: [],
  allowCloseColorMatch: true,
  sizeIds: [],
  customSize: "",
  minPrice: "",
  maxPrice: "",
  matchMode: null,
  onlyExactCriteria: false,
  alertFrequency: null,
};

function toApiAlertFrequency(frequency: AlertFrequency | null): ApiAlertFrequency {
  switch (frequency) {
    case "daily":
    case "weekly":
      return frequency;
    case "instant":
    case "later":
    default:
      return "realtime";
  }
}

const COLOR_SWATCHES: Record<string, string> = {
  Black: "#1a1a1a",
  Brown: "#6b4423",
  Beige: "#d9c5a0",
  Tan: "#c19a6b",
  White: "#f8f5ee",
  Cream: "#f0e6d2",
  Gray: "#8a8a8a",
  Navy: "#1f2d4d",
  Blue: "#3b6db1",
  Red: "#9b2a2a",
  Burgundy: "#5c1f2c",
  Pink: "#e8b4c1",
  Green: "#3e5d3a",
  Gold: "#c8a96a",
  Silver: "#c4c4c4",
};

const MODEL_PLACEHOLDERS = [
  "Chanel Classic Flap",
  "Hermès Birkin 30",
  "Hermès Kelly 28",
  "Louis Vuitton Speedy 25",
  "Dior Lady Dior",
  "Fendi Baguette",
  "Prada Re-Edition",
  "Celine Triomphe",
];

const GENERIC_SIZE_NAMES = ["Mini", "Small", "Medium", "Large"];

const TOTAL_STEPS = 11;

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<FormState>(initialState);
  const [brandSearch, setBrandSearch] = useState("");

  const brandsQ = useListBrands();
  const stylesQ = useListStyles();
  const colorsQ = useListColors();
  const conditionsQ = useListConditions();
  const sizesQ = useListSizes();
  const brands = brandsQ.data ?? [];
  const styles = stylesQ.data ?? [];
  const colors = colorsQ.data ?? [];
  const conditions = conditionsQ.data ?? [];
  const sizes = sizesQ.data ?? [];

  const refQueries = [brandsQ, stylesQ, colorsQ, conditionsQ, sizesQ];
  const refLoading = refQueries.some((q) => q.isLoading);
  const refError = refQueries.find((q) => q.isError);
  const refEmptyAfterLoad =
    !refLoading &&
    !refError &&
    (brands.length === 0 ||
      styles.length === 0 ||
      colors.length === 0 ||
      conditions.length === 0 ||
      sizes.length === 0);
  const refRetry = () => {
    brandsQ.refetch();
    stylesQ.refetch();
    colorsQ.refetch();
    conditionsQ.refetch();
    sizesQ.refetch();
  };

  const createPref = useCreateBagPreference();

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const toggleId = (
    key: "brandIds" | "styleIds" | "colorIds" | "sizeIds",
    id: number,
  ) => {
    setForm((s) => ({
      ...s,
      [key]: s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id],
    }));
  };

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [brands, brandSearch]);

  const genericSizes = useMemo(
    () => sizes.filter((s) => GENERIC_SIZE_NAMES.includes(s.name)),
    [sizes],
  );

  const goNext = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };
  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1));
  };

  const priceInvalid = (() => {
    if (!form.minPrice || !form.maxPrice) return false;
    const minN = Number(form.minPrice);
    const maxN = Number(form.maxPrice);
    if (Number.isNaN(minN) || Number.isNaN(maxN)) return false;
    return minN > maxN;
  })();

  const canAdvance = (): boolean => {
    switch (step) {
      case 1:
        return true;
      case 2:
        return form.brandIds.length > 0;
      case 3:
        return form.styleIds.length > 0;
      case 4:
        if (form.exactModelEnabled === null) return false;
        if (form.exactModelEnabled && form.modelQuery.trim().length < 2)
          return false;
        return true;
      case 5:
        return form.conditionMinId !== null;
      case 6:
        return form.colorIds.length > 0;
      case 7:
        return form.sizeIds.length > 0 || form.customSize.trim().length > 0;
      case 8:
        return !priceInvalid;
      case 9:
        return form.matchMode !== null;
      case 10:
        return form.alertFrequency !== null;
      case 11:
        return true;
      default:
        return true;
    }
  };

  const buildNickname = (): string => {
    const firstBrand = brands.find((b) => b.id === form.brandIds[0])?.name;
    const firstStyle = styles.find((s) => s.id === form.styleIds[0])?.name;
    if (form.exactModelEnabled && form.modelQuery.trim()) {
      return form.modelQuery.trim().slice(0, 60);
    }
    if (firstBrand && firstStyle) return `${firstBrand} ${firstStyle}`;
    if (firstBrand) return `${firstBrand} Watchlist`;
    return "My Watchlist";
  };

  const submit = () => {
    const nickname = buildNickname();
    const customSizeText = form.customSize.trim();
    const baseModel = form.exactModelEnabled ? form.modelQuery.trim() : "";

    // If the custom size text matches a known size in the reference table,
    // promote it into sizeIds. Otherwise keep it as a free-text hint that gets
    // composed onto modelQuery so we never silently drop user input.
    const matchedSize = customSizeText
      ? sizes.find(
          (s) => s.name.toLowerCase() === customSizeText.toLowerCase(),
        )
      : undefined;
    const finalSizeIds =
      matchedSize && !form.sizeIds.includes(matchedSize.id)
        ? [...form.sizeIds, matchedSize.id]
        : form.sizeIds;
    const sizeHint = matchedSize ? "" : customSizeText;

    const composedModel = [baseModel, sizeHint]
      .filter(Boolean)
      .join(" ")
      .trim();
    const modelQuery = composedModel.length > 0 ? composedModel : null;

    createPref.mutate(
      {
        data: {
          nickname,
          brandIds: form.brandIds,
          styleIds: form.styleIds,
          colorIds: form.colorIds,
          sizeIds: finalSizeIds,
          exactModelEnabled: form.exactModelEnabled === true,
          modelQuery,
          conditionMinId: form.conditionMinId,
          allowCloseColorMatch: form.allowCloseColorMatch,
          minPrice: form.minPrice ? Number(form.minPrice) : null,
          maxPrice: form.maxPrice ? Number(form.maxPrice) : null,
          onlyExactCriteria: form.onlyExactCriteria,
          allowCloseMatches: form.matchMode === "smart",
          alertFrequency: toApiAlertFrequency(form.alertFrequency),
          active: true,
        },
      },
      {
        onSuccess: () => {
          if (form.alertFrequency) {
            try {
              localStorage.setItem(
                "bagscout:alertFrequency",
                form.alertFrequency,
              );
            } catch {
              // ignore storage errors
            }
          }
          queryClient.invalidateQueries({
            queryKey: getListBagPreferencesQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          toast({
            title: "You're all set",
            description: "Your bag profile is live. We're scouting now.",
          });
          setLocation("/dashboard");
        },
        onError: (err: unknown) => {
          toast({
            variant: "destructive",
            title: "Something went wrong",
            description:
              err instanceof Error
                ? err.message
                : "Failed to save your profile. Please try again.",
          });
        },
      },
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Top bar with progress */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="font-serif text-lg font-semibold tracking-tight">
            BagScout
          </div>
          <div className="flex-1 mx-2">
            <div className="h-[2px] bg-border relative overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-primary"
                initial={false}
                animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
          </div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground tabular-nums">
            {step.toString().padStart(2, "0")} / {TOTAL_STEPS}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-10 sm:py-16">
          {refLoading && step > 1 && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground py-12">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your options...
            </div>
          )}

          {(refError || refEmptyAfterLoad) && step > 1 && (
            <div className="border border-destructive/40 bg-destructive/5 p-6 my-6 flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-foreground">
                  We couldn't load your options
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Check your connection and try again. If this keeps happening,
                  contact support.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={refRetry}
                  className="rounded-none uppercase tracking-widest text-xs font-semibold h-10 mt-4"
                  data-testid="button-retry-reference"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -24 }}
              transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            >
              {step === 1 && <WelcomeStep onStart={goNext} />}

              {step === 2 && (
                <BrandStep
                  brands={filteredBrands}
                  totalBrands={brands.length}
                  selected={form.brandIds}
                  onToggle={(id) => toggleId("brandIds", id)}
                  search={brandSearch}
                  onSearch={setBrandSearch}
                />
              )}

              {step === 3 && (
                <StyleStep
                  styles={styles}
                  selected={form.styleIds}
                  onToggle={(id) => toggleId("styleIds", id)}
                />
              )}

              {step === 4 && (
                <ExactModelStep
                  enabled={form.exactModelEnabled}
                  modelQuery={form.modelQuery}
                  onChangeEnabled={(v) => setField("exactModelEnabled", v)}
                  onChangeQuery={(v) => setField("modelQuery", v)}
                />
              )}

              {step === 5 && (
                <ConditionStep
                  conditions={conditions}
                  selectedId={form.conditionMinId}
                  onSelect={(id) => setField("conditionMinId", id)}
                />
              )}

              {step === 6 && (
                <ColorStep
                  colors={colors}
                  selected={form.colorIds}
                  onToggle={(id) => toggleId("colorIds", id)}
                  allowClose={form.allowCloseColorMatch}
                  onChangeAllowClose={(v) =>
                    setField("allowCloseColorMatch", v)
                  }
                />
              )}

              {step === 7 && (
                <SizeStep
                  genericSizes={genericSizes}
                  selected={form.sizeIds}
                  onToggle={(id) => toggleId("sizeIds", id)}
                  customSize={form.customSize}
                  onChangeCustomSize={(v) => setField("customSize", v)}
                />
              )}

              {step === 8 && (
                <PriceStep
                  minPrice={form.minPrice}
                  maxPrice={form.maxPrice}
                  onChangeMin={(v) => setField("minPrice", v)}
                  onChangeMax={(v) => setField("maxPrice", v)}
                  invalid={priceInvalid}
                />
              )}

              {step === 9 && (
                <StrictnessStep
                  matchMode={form.matchMode}
                  onChangeMode={(v) => setField("matchMode", v)}
                  onlyExactCriteria={form.onlyExactCriteria}
                  onChangeOnlyExact={(v) => setField("onlyExactCriteria", v)}
                />
              )}

              {step === 10 && (
                <AlertsStep
                  frequency={form.alertFrequency}
                  onChange={(v) => setField("alertFrequency", v)}
                />
              )}

              {step === 11 && (
                <ConfirmationStep
                  form={form}
                  brands={brands}
                  styles={styles}
                  colors={colors}
                  conditions={conditions}
                  sizes={sizes}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        {step > 1 && (
          <div className="border-t border-border bg-background/80 backdrop-blur sticky bottom-0">
            <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
              <Button
                type="button"
                variant="ghost"
                onClick={goBack}
                className="rounded-none uppercase tracking-widest text-xs font-semibold h-11"
                data-testid="button-back"
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>

              {step < TOTAL_STEPS ? (
                <Button
                  type="button"
                  onClick={goNext}
                  disabled={!canAdvance()}
                  className="rounded-none uppercase tracking-widest text-xs font-semibold h-11 px-6 sm:px-8"
                  data-testid="button-next"
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={submit}
                  disabled={createPref.isPending}
                  className="rounded-none uppercase tracking-widest text-xs font-semibold h-11 px-6 sm:px-8"
                  data-testid="button-finish"
                >
                  {createPref.isPending ? "Saving..." : "Start Watching"}
                  {!createPref.isPending && (
                    <Sparkles className="ml-2 h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- Step components ---------- */

function StepHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8 sm:mb-10">
      {eyebrow && (
        <div className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold mb-3">
          {eyebrow}
        </div>
      )}
      <h1 className="font-serif text-3xl sm:text-4xl leading-tight text-foreground">
        {title}
      </h1>
      {subtitle && (
        <p className="text-muted-foreground mt-3 sm:mt-4 max-w-xl text-base sm:text-lg">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="py-8 sm:py-16 text-center sm:text-left">
      <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-primary font-semibold mb-6">
        <span className="h-px w-8 bg-primary inline-block" />
        Welcome to BagScout
      </div>
      <h1 className="font-serif text-4xl sm:text-6xl leading-[1.05] text-foreground max-w-2xl mx-auto sm:mx-0">
        Find the bag before someone else does.
      </h1>
      <p className="text-muted-foreground mt-6 sm:mt-8 max-w-xl mx-auto sm:mx-0 text-base sm:text-lg leading-relaxed">
        Create your dream bag profile and we'll watch trusted resale sources
        for you — quietly, around the clock.
      </p>
      <div className="mt-10 sm:mt-12">
        <Button
          onClick={onStart}
          className="rounded-none uppercase tracking-widest text-xs font-semibold h-12 px-8"
          data-testid="button-start"
        >
          Build My Bag Profile <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <p className="text-xs text-muted-foreground mt-4 uppercase tracking-widest">
          Takes about 60 seconds
        </p>
      </div>
    </div>
  );
}

function BrandStep({
  brands,
  totalBrands,
  selected,
  onToggle,
  search,
  onSearch,
}: {
  brands: { id: number; name: string }[];
  totalBrands: number;
  selected: number[];
  onToggle: (id: number) => void;
  search: string;
  onSearch: (v: string) => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Step 02 — Brands"
        title="Which brands should we watch?"
        subtitle="Pick as many houses as you like. We'll scout listings from each."
      />

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search brands..."
          className="rounded-none h-12 pl-9"
          data-testid="input-brand-search"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {brands.map((b) => {
          const isSelected = selected.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onToggle(b.id)}
              aria-pressed={isSelected}
              className={`relative h-14 sm:h-16 px-3 text-sm sm:text-base font-medium border transition-all text-left flex items-center ${
                isSelected
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/40 text-foreground"
              }`}
              data-testid={`button-brand-${b.id}`}
            >
              <span className="font-serif">{b.name}</span>
              {isSelected && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
              )}
            </button>
          );
        })}
      </div>

      {brands.length === 0 && totalBrands > 0 && (
        <p className="text-sm text-muted-foreground mt-6">
          No brands match "{search}".
        </p>
      )}

      <p className="text-xs text-muted-foreground mt-6 uppercase tracking-widest">
        {selected.length} selected
      </p>
    </div>
  );
}

function StyleStep({
  styles,
  selected,
  onToggle,
}: {
  styles: { id: number; name: string }[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Step 03 — Silhouette"
        title="What type of bag are you looking for?"
        subtitle="Select every silhouette that fits your style."
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {styles.map((s) => {
          const isSelected = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              aria-pressed={isSelected}
              className={`relative h-14 sm:h-16 px-3 text-sm sm:text-base font-medium border transition-all text-left flex items-center ${
                isSelected
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/40 text-foreground"
              }`}
              data-testid={`button-style-${s.id}`}
            >
              <span className="font-serif">{s.name}</span>
              {isSelected && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-6 uppercase tracking-widest">
        {selected.length} selected
      </p>
    </div>
  );
}

function ExactModelStep({
  enabled,
  modelQuery,
  onChangeEnabled,
  onChangeQuery,
}: {
  enabled: boolean | null;
  modelQuery: string;
  onChangeEnabled: (v: boolean) => void;
  onChangeQuery: (v: string) => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Step 04 — The Model"
        title="Are you looking for an exact model?"
        subtitle="If you have a specific bag in mind we'll prioritize it. Otherwise we'll surface relevant matches."
      />

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <ChoiceCard
          icon={<Target className="h-5 w-5" />}
          active={enabled === true}
          onClick={() => onChangeEnabled(true)}
          title="Yes, I know the model"
          description="Search a specific bag"
          testid="choice-exact-yes"
        />
        <ChoiceCard
          icon={<Wand2 className="h-5 w-5" />}
          active={enabled === false}
          onClick={() => onChangeEnabled(false)}
          title="No, show me good matches"
          description="Open to options that fit"
          testid="choice-exact-no"
        />
      </div>

      {enabled === true && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <Label className="uppercase tracking-widest text-xs font-semibold">
            Model name
          </Label>
          <Input
            value={modelQuery}
            onChange={(e) => onChangeQuery(e.target.value)}
            placeholder="e.g. Chanel Classic Flap"
            className="rounded-none h-12"
            data-testid="input-model"
          />
          <div className="flex flex-wrap gap-2 pt-1">
            {MODEL_PLACEHOLDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChangeQuery(p)}
                className="text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border hover:border-foreground/40 px-2.5 py-1.5"
                data-testid={`suggest-${p.replace(/\s+/g, "-")}`}
              >
                {p}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ConditionStep({
  conditions,
  selectedId,
  onSelect,
}: {
  conditions: { id: number; name: string; rank: number }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const sorted = [...conditions].sort((a, b) => a.rank - b.rank);
  return (
    <div>
      <StepHeader
        eyebrow="Step 05 — Condition"
        title="What condition are you comfortable with?"
        subtitle="We'll only alert you on listings at or above this grade."
      />
      <div className="space-y-2">
        {sorted.map((c, idx) => {
          const isSelected = selectedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              aria-pressed={isSelected}
              className={`w-full flex items-center gap-4 px-5 py-4 border text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/40"
              }`}
              data-testid={`button-condition-${c.id}`}
            >
              <span className="font-serif text-2xl text-muted-foreground tabular-nums w-8">
                0{idx + 1}
              </span>
              <div className="flex-1">
                <div className="font-medium">{c.name}</div>
              </div>
              {isSelected && <Check className="h-5 w-5 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorStep({
  colors,
  selected,
  onToggle,
  allowClose,
  onChangeAllowClose,
}: {
  colors: { id: number; name: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  allowClose: boolean;
  onChangeAllowClose: (v: boolean) => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Step 06 — Colors"
        title="Which colors should we watch?"
        subtitle="Select every shade you'd consider."
      />
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {colors.map((c) => {
          const isSelected = selected.includes(c.id);
          const swatch = COLOR_SWATCHES[c.name] ?? "#cccccc";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggle(c.id)}
              aria-pressed={isSelected}
              className={`group flex flex-col items-center gap-2 p-3 border transition-all ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/40"
              }`}
              data-testid={`button-color-${c.id}`}
            >
              <span
                className={`relative h-10 w-10 sm:h-12 sm:w-12 rounded-full border ${
                  c.name === "White" || c.name === "Cream"
                    ? "border-foreground/20"
                    : "border-transparent"
                }`}
                style={{ background: swatch }}
              >
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check
                      className={`h-5 w-5 ${
                        c.name === "White" ||
                        c.name === "Cream" ||
                        c.name === "Beige" ||
                        c.name === "Gold" ||
                        c.name === "Silver" ||
                        c.name === "Pink"
                          ? "text-foreground"
                          : "text-background"
                      }`}
                    />
                  </span>
                )}
              </span>
              <span className="text-xs sm:text-sm font-medium">{c.name}</span>
            </button>
          );
        })}
      </div>

      <label className="flex items-start gap-3 mt-8 cursor-pointer p-4 border border-border hover:border-foreground/40 transition-colors">
        <Checkbox
          checked={allowClose}
          onCheckedChange={(v) => onChangeAllowClose(!!v)}
          className="mt-0.5"
          data-testid="checkbox-close-colors"
        />
        <div className="flex-1">
          <div className="text-sm font-medium">Include close color matches</div>
          <p className="text-xs text-muted-foreground mt-1">
            Beige can match cream, ivory, nude, sand, taupe.
          </p>
        </div>
      </label>

      <p className="text-xs text-muted-foreground mt-6 uppercase tracking-widest">
        {selected.length} selected
      </p>
    </div>
  );
}

function SizeStep({
  genericSizes,
  selected,
  onToggle,
  customSize,
  onChangeCustomSize,
}: {
  genericSizes: { id: number; name: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  customSize: string;
  onChangeCustomSize: (v: string) => void;
}) {
  const labels = [
    { name: "Mini", desc: "Pochette, micro" },
    { name: "Small", desc: "Speedy 25, BB" },
    { name: "Medium", desc: "PM, Birkin 30" },
    { name: "Large", desc: "MM, Birkin 35" },
  ];

  return (
    <div>
      <StepHeader
        eyebrow="Step 07 — Size"
        title="What size are you looking for?"
        subtitle="Pick a general size or enter the exact model size below."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
        {labels.map((l) => {
          const sizeRow = genericSizes.find((s) => s.name === l.name);
          if (!sizeRow) return null;
          const isSelected = selected.includes(sizeRow.id);
          return (
            <button
              key={sizeRow.id}
              type="button"
              onClick={() => onToggle(sizeRow.id)}
              aria-pressed={isSelected}
              className={`p-4 border text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/40"
              }`}
              data-testid={`button-size-${sizeRow.id}`}
            >
              <div className="font-serif text-lg">{l.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{l.desc}</div>
            </button>
          );
        })}
      </div>

      <div className="border border-border p-5">
        <Label className="uppercase tracking-widest text-xs font-semibold">
          Or enter the exact model size
        </Label>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          e.g. Birkin 25, Kelly 28, Speedy 30
        </p>
        <Input
          value={customSize}
          onChange={(e) => onChangeCustomSize(e.target.value)}
          placeholder="Birkin 25"
          className="rounded-none h-12"
          data-testid="input-custom-size"
        />
      </div>
    </div>
  );
}

function PriceStep({
  minPrice,
  maxPrice,
  onChangeMin,
  onChangeMax,
  invalid,
}: {
  minPrice: string;
  maxPrice: string;
  onChangeMin: (v: string) => void;
  onChangeMax: (v: string) => void;
  invalid: boolean;
}) {
  const presets = [
    { label: "Under $2k", min: "", max: "2000" },
    { label: "$2k–$5k", min: "2000", max: "5000" },
    { label: "$5k–$10k", min: "5000", max: "10000" },
    { label: "$10k+", min: "10000", max: "" },
  ];
  return (
    <div>
      <StepHeader
        eyebrow="Step 08 — Price"
        title="What price range should we watch?"
        subtitle="Set a budget so we don't bother you with listings out of range. Currency is USD."
      />

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="space-y-2">
          <Label className="uppercase tracking-widest text-xs font-semibold">
            Minimum
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={minPrice}
              onChange={(e) => onChangeMin(e.target.value)}
              placeholder="0"
              className="rounded-none h-12 pl-7"
              data-testid="input-min-price"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="uppercase tracking-widest text-xs font-semibold">
            Maximum
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={maxPrice}
              onChange={(e) => onChangeMax(e.target.value)}
              placeholder="No limit"
              className="rounded-none h-12 pl-7"
              data-testid="input-max-price"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = minPrice === p.min && maxPrice === p.max;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                onChangeMin(p.min);
                onChangeMax(p.max);
              }}
              className={`text-xs uppercase tracking-widest px-3 py-2 border transition-colors ${
                active
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/40"
              }`}
              data-testid={`preset-${p.label}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {invalid ? (
        <p className="text-xs text-destructive mt-8" data-testid="text-price-error">
          Minimum price must be less than or equal to maximum price.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mt-8 italic">
          Tip — leave either field blank for no limit.
        </p>
      )}
    </div>
  );
}

function StrictnessStep({
  matchMode,
  onChangeMode,
  onlyExactCriteria,
  onChangeOnlyExact,
}: {
  matchMode: "exact" | "smart" | null;
  onChangeMode: (v: "exact" | "smart") => void;
  onlyExactCriteria: boolean;
  onChangeOnlyExact: (v: boolean) => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Step 09 — Strictness"
        title="How strict should we be?"
        subtitle="Choose your alert philosophy."
      />

      <div className="space-y-3">
        <ChoiceCard
          icon={<Target className="h-5 w-5" />}
          active={matchMode === "exact"}
          onClick={() => onChangeMode("exact")}
          title="Exact only"
          description="Only alert me when every selected criterion matches."
          testid="choice-strict-exact"
          fullWidth
        />
        <ChoiceCard
          icon={<Sparkles className="h-5 w-5" />}
          active={matchMode === "smart"}
          onClick={() => onChangeMode("smart")}
          title="Smart close matches"
          description="Alert me on close matches that look genuinely relevant."
          testid="choice-strict-smart"
          fullWidth
        />
      </div>

      <label className="flex items-start gap-3 mt-8 cursor-pointer p-4 border border-border hover:border-foreground/40 transition-colors">
        <Checkbox
          checked={onlyExactCriteria}
          onCheckedChange={(v) => onChangeOnlyExact(!!v)}
          className="mt-0.5"
          data-testid="checkbox-only-exact"
        />
        <div className="flex-1">
          <div className="text-sm font-medium">
            Only show listings within my selected criteria
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Hides anything that doesn't fit your filters, even when browsing.
          </p>
        </div>
      </label>
    </div>
  );
}

function AlertsStep({
  frequency,
  onChange,
}: {
  frequency: AlertFrequency | null;
  onChange: (v: AlertFrequency) => void;
}) {
  const options: {
    value: AlertFrequency;
    title: string;
    desc: string;
    icon: React.ReactNode;
    soon?: boolean;
  }[] = [
    {
      value: "instant",
      title: "Instant email",
      desc: "Get notified the moment a match drops.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      value: "daily",
      title: "Daily digest",
      desc: "One curated email each morning.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      value: "weekly",
      title: "Weekly digest",
      desc: "Every Friday — the best of the week.",
      icon: <CalendarDays className="h-5 w-5" />,
    },
    {
      value: "later",
      title: "Push & SMS",
      desc: "Coming soon — we'll use instant email while you wait.",
      icon: <Bell className="h-5 w-5" />,
      soon: true,
    },
  ];

  return (
    <div>
      <StepHeader
        eyebrow="Step 10 — Alerts"
        title="How should we alert you?"
        subtitle="Pick the rhythm that fits your inbox."
      />
      <div className="space-y-3">
        {options.map((o) => (
          <ChoiceCard
            key={o.value}
            icon={o.icon}
            active={frequency === o.value}
            onClick={() => onChange(o.value)}
            title={o.title}
            description={o.desc}
            badge={o.soon ? "Soon" : undefined}
            testid={`choice-alert-${o.value}`}
            fullWidth
          />
        ))}
      </div>
    </div>
  );
}

function ConfirmationStep({
  form,
  brands,
  styles,
  colors,
  conditions,
  sizes,
}: {
  form: FormState;
  brands: { id: number; name: string }[];
  styles: { id: number; name: string }[];
  colors: { id: number; name: string }[];
  conditions: { id: number; name: string; rank: number }[];
  sizes: { id: number; name: string }[];
}) {
  const brandNames = form.brandIds
    .map((id) => brands.find((b) => b.id === id)?.name)
    .filter(Boolean) as string[];
  const styleNames = form.styleIds
    .map((id) => styles.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[];
  const colorNames = form.colorIds
    .map((id) => colors.find((c) => c.id === id)?.name)
    .filter(Boolean) as string[];
  const sizeNames = form.sizeIds
    .map((id) => sizes.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[];
  const conditionName = form.conditionMinId
    ? conditions.find((c) => c.id === form.conditionMinId)?.name
    : null;

  const priceLabel = (() => {
    const min = form.minPrice;
    const max = form.maxPrice;
    if (!min && !max) return "Any price";
    if (min && max) return `$${Number(min).toLocaleString()} – $${Number(max).toLocaleString()}`;
    if (min) return `$${Number(min).toLocaleString()}+`;
    return `Up to $${Number(max).toLocaleString()}`;
  })();

  const matchLabel =
    form.matchMode === "exact" ? "Exact only" : "Smart close matches";

  const alertLabel = (() => {
    switch (form.alertFrequency) {
      case "instant":
        return "Instant email";
      case "daily":
        return "Daily digest";
      case "weekly":
        return "Weekly digest";
      case "later":
        return "Push & SMS waitlist; instant email for now";
      default:
        return "—";
    }
  })();

  const modelLine = form.exactModelEnabled
    ? form.modelQuery || "—"
    : "Open to good matches";

  return (
    <div>
      <StepHeader
        eyebrow="Step 11 — Review"
        title="Your bag profile"
        subtitle="One last look — then we start scouting."
      />

      <div className="border border-border divide-y divide-border">
        <SummaryRow label="Brands" value={brandNames.join(", ") || "—"} />
        <SummaryRow label="Styles" value={styleNames.join(", ") || "—"} />
        <SummaryRow label="Model" value={modelLine} />
        <SummaryRow label="Condition (min)" value={conditionName ?? "—"} />
        <SummaryRow
          label="Colors"
          value={
            colorNames.length
              ? `${colorNames.join(", ")}${form.allowCloseColorMatch ? " (+ close)" : ""}`
              : "—"
          }
        />
        <SummaryRow
          label="Size"
          value={
            [...sizeNames, form.customSize.trim()].filter(Boolean).join(", ") ||
            "—"
          }
        />
        <SummaryRow label="Price" value={priceLabel} />
        <SummaryRow
          label="Match strictness"
          value={`${matchLabel}${form.onlyExactCriteria ? " · within criteria only" : ""}`}
        />
        <SummaryRow label="Alerts" value={alertLabel} />
      </div>

      <p className="text-xs text-muted-foreground mt-6 italic">
        You can always tweak this later from your watchlists.
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-6 px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:w-44 shrink-0 font-semibold">
        {label}
      </div>
      <div className="text-sm sm:text-base text-foreground flex-1">
        {value}
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  active,
  onClick,
  title,
  description,
  badge,
  testid,
  fullWidth = false,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
  badge?: string;
  testid?: string;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testid}
      className={`relative flex items-start gap-4 p-5 border text-left transition-all ${
        fullWidth ? "w-full" : ""
      } ${
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:border-foreground/40"
      }`}
    >
      <div
        className={`h-10 w-10 shrink-0 flex items-center justify-center border ${
          active ? "border-primary text-primary" : "border-border text-foreground/70"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-serif text-lg leading-tight">{title}</div>
          {badge && (
            <span className="text-[9px] uppercase tracking-widest text-primary border border-primary px-1.5 py-0.5 font-semibold">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      {active && <Check className="h-5 w-5 text-primary shrink-0 mt-1" />}
    </button>
  );
}
