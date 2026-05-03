import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTaxonomyBrands,
  getListTaxonomyBrandsQueryKey,
  useCreateTaxonomyBrand,
  useDeleteTaxonomyBrand,
  useListTaxonomyColors,
  getListTaxonomyColorsQueryKey,
  useCreateTaxonomyColor,
  useDeleteTaxonomyColor,
  useListTaxonomyConditions,
  getListTaxonomyConditionsQueryKey,
  useCreateTaxonomyCondition,
  useDeleteTaxonomyCondition,
  useListTaxonomySizes,
  getListTaxonomySizesQueryKey,
  useCreateTaxonomySize,
  useDeleteTaxonomySize,
  useListTaxonomyStyles,
  getListTaxonomyStylesQueryKey,
  useCreateTaxonomyStyle,
  useDeleteTaxonomyStyle,
  useListTaxonomyModels,
  getListTaxonomyModelsQueryKey,
  useCreateTaxonomyModel,
  useDeleteTaxonomyModel,
} from "@workspace/api-client-react";

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

export function TaxonomySection() {
  return (
    <Card className="rounded-none shadow-none border-border">
      <CardHeader className="bg-secondary/30 border-b border-border pb-4">
        <CardTitle className="font-serif text-xl">Taxonomy Manager</CardTitle>
        <CardDescription>
          Add canonical brands, colors, conditions, sizes, styles, and brand-scoped model
          aliases. Names are auto-normalized for matching.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="brands" className="w-full">
          <TabsList className="rounded-none border-b border-border w-full justify-start bg-transparent p-0 h-auto">
            {(["brands", "models", "colors", "conditions", "sizes", "styles"] as const).map(
              (t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  data-testid={`taxonomy-tab-${t}`}
                  className="rounded-none uppercase tracking-widest text-[10px] data-[state=active]:border-b-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent"
                >
                  {t}
                </TabsTrigger>
              ),
            )}
          </TabsList>

          <TabsContent value="brands" className="p-6 mt-0">
            <BrandsTab />
          </TabsContent>
          <TabsContent value="models" className="p-6 mt-0">
            <ModelsTab />
          </TabsContent>
          <TabsContent value="colors" className="p-6 mt-0">
            <ColorsTab />
          </TabsContent>
          <TabsContent value="conditions" className="p-6 mt-0">
            <ConditionsTab />
          </TabsContent>
          <TabsContent value="sizes" className="p-6 mt-0">
            <SizesTab />
          </TabsContent>
          <TabsContent value="styles" className="p-6 mt-0">
            <StylesTab />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function BrandsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useListTaxonomyBrands({
    query: { queryKey: getListTaxonomyBrandsQueryKey() },
  });
  const create = useCreateTaxonomyBrand();
  const del = useDeleteTaxonomyBrand();

  const add = () => {
    if (!name.trim()) return;
    create.mutate(
      { data: { name: name.trim() } },
      {
        onSuccess: () => {
          setName("");
          qc.invalidateQueries({ queryKey: getListTaxonomyBrandsQueryKey() });
          toast({ title: "Brand added" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Add failed",
            description: errMsg(e, "Could not add brand"),
          }),
      },
    );
  };

  const remove = (id: number) => {
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListTaxonomyBrandsQueryKey() });
          toast({ title: "Brand deleted" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Delete failed",
            description: errMsg(e, "Could not delete brand"),
          }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="New brand name (e.g. Goyard)"
          className="rounded-none max-w-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          data-testid="taxonomy-brand-input"
        />
        <Button
          onClick={add}
          disabled={!name.trim() || create.isPending}
          className="rounded-none uppercase tracking-widest text-[10px]"
          data-testid="taxonomy-brand-add"
        >
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      <SimpleList
        isLoading={isLoading}
        rows={data?.map((r) => ({
          id: r.id,
          primary: r.name,
          secondary: `slug: ${r.slug} · normalized: ${r.normalizedName}`,
        }))}
        onDelete={remove}
        empty="No brands yet."
      />
    </div>
  );
}

function ColorsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [family, setFamily] = useState("");
  const [hex, setHex] = useState("");
  const { data, isLoading } = useListTaxonomyColors({
    query: { queryKey: getListTaxonomyColorsQueryKey() },
  });
  const create = useCreateTaxonomyColor();
  const del = useDeleteTaxonomyColor();

  const add = () => {
    if (!name.trim() || !family.trim()) return;
    create.mutate(
      {
        data: {
          name: name.trim(),
          family: family.trim(),
          hex: hex.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setName("");
          setFamily("");
          setHex("");
          qc.invalidateQueries({ queryKey: getListTaxonomyColorsQueryKey() });
          toast({ title: "Color added" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Add failed",
            description: errMsg(e, "Could not add color"),
          }),
      },
    );
  };

  const remove = (id: number) => {
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListTaxonomyColorsQueryKey() });
          toast({ title: "Color deleted" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Delete failed",
            description: errMsg(e, "Could not delete color"),
          }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Color name"
          className="rounded-none max-w-[180px]"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder="Family (e.g. neutral)"
          className="rounded-none max-w-[180px]"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
        />
        <Input
          placeholder="#hex (optional)"
          className="rounded-none max-w-[140px]"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
        />
        <Button
          onClick={add}
          disabled={!name.trim() || !family.trim() || create.isPending}
          className="rounded-none uppercase tracking-widest text-[10px]"
        >
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      <SimpleList
        isLoading={isLoading}
        rows={data?.map((r) => ({
          id: r.id,
          primary: r.name,
          secondary: `family: ${r.family}${r.hex ? ` · ${r.hex}` : ""} · normalized: ${r.normalizedName}`,
        }))}
        onDelete={remove}
        empty="No colors yet."
      />
    </div>
  );
}

function ConditionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [rank, setRank] = useState("");
  const { data, isLoading } = useListTaxonomyConditions({
    query: { queryKey: getListTaxonomyConditionsQueryKey() },
  });
  const create = useCreateTaxonomyCondition();
  const del = useDeleteTaxonomyCondition();

  const add = () => {
    const r = parseInt(rank, 10);
    if (!name.trim() || Number.isNaN(r) || r < 1 || r > 99) return;
    create.mutate(
      { data: { name: name.trim(), rank: r } },
      {
        onSuccess: () => {
          setName("");
          setRank("");
          qc.invalidateQueries({ queryKey: getListTaxonomyConditionsQueryKey() });
          toast({ title: "Condition added" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Add failed",
            description: errMsg(e, "Could not add condition"),
          }),
      },
    );
  };

  const remove = (id: number) => {
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListTaxonomyConditionsQueryKey() });
          toast({ title: "Condition deleted" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Delete failed",
            description: errMsg(e, "Could not delete condition"),
          }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Condition name"
          className="rounded-none max-w-[220px]"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          type="number"
          min={1}
          max={99}
          placeholder="Rank (1=best)"
          className="rounded-none max-w-[140px]"
          value={rank}
          onChange={(e) => setRank(e.target.value)}
        />
        <Button
          onClick={add}
          disabled={!name.trim() || !rank || create.isPending}
          className="rounded-none uppercase tracking-widest text-[10px]"
        >
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      <SimpleList
        isLoading={isLoading}
        rows={data?.map((r) => ({
          id: r.id,
          primary: `${r.name} (rank ${r.rank})`,
          secondary: `slug: ${r.slug} · normalized: ${r.normalizedName}`,
        }))}
        onDelete={remove}
        empty="No conditions yet."
      />
    </div>
  );
}

function SizesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useListTaxonomySizes({
    query: { queryKey: getListTaxonomySizesQueryKey() },
  });
  const create = useCreateTaxonomySize();
  const del = useDeleteTaxonomySize();
  const add = () => {
    if (!name.trim()) return;
    create.mutate(
      { data: { name: name.trim() } },
      {
        onSuccess: () => {
          setName("");
          qc.invalidateQueries({ queryKey: getListTaxonomySizesQueryKey() });
          toast({ title: "Size added" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Add failed",
            description: errMsg(e, "Could not add size"),
          }),
      },
    );
  };
  const remove = (id: number) =>
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListTaxonomySizesQueryKey() });
          toast({ title: "Size deleted" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Delete failed",
            description: errMsg(e, "Could not delete size"),
          }),
      },
    );
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Size name (e.g. Birkin 30)"
          className="rounded-none max-w-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button
          onClick={add}
          disabled={!name.trim() || create.isPending}
          className="rounded-none uppercase tracking-widest text-[10px]"
        >
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      <SimpleList
        isLoading={isLoading}
        rows={data?.map((r) => ({
          id: r.id,
          primary: r.name,
          secondary: `slug: ${r.slug} · normalized: ${r.normalizedName}`,
        }))}
        onDelete={remove}
        empty="No sizes yet."
      />
    </div>
  );
}

function StylesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useListTaxonomyStyles({
    query: { queryKey: getListTaxonomyStylesQueryKey() },
  });
  const create = useCreateTaxonomyStyle();
  const del = useDeleteTaxonomyStyle();
  const add = () => {
    if (!name.trim()) return;
    create.mutate(
      { data: { name: name.trim() } },
      {
        onSuccess: () => {
          setName("");
          qc.invalidateQueries({ queryKey: getListTaxonomyStylesQueryKey() });
          toast({ title: "Style added" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Add failed",
            description: errMsg(e, "Could not add style"),
          }),
      },
    );
  };
  const remove = (id: number) =>
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListTaxonomyStylesQueryKey() });
          toast({ title: "Style deleted" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Delete failed",
            description: errMsg(e, "Could not delete style"),
          }),
      },
    );
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Style name (e.g. Tote)"
          className="rounded-none max-w-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button
          onClick={add}
          disabled={!name.trim() || create.isPending}
          className="rounded-none uppercase tracking-widest text-[10px]"
        >
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      <SimpleList
        isLoading={isLoading}
        rows={data?.map((r) => ({
          id: r.id,
          primary: r.name,
          secondary: `slug: ${r.slug} · normalized: ${r.normalizedName}`,
        }))}
        onDelete={remove}
        empty="No styles yet."
      />
    </div>
  );
}

function ModelsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [brandId, setBrandId] = useState<string>("");
  const [filterBrandId, setFilterBrandId] = useState<string>("all");
  const [name, setName] = useState("");

  const { data: brands } = useListTaxonomyBrands({
    query: { queryKey: getListTaxonomyBrandsQueryKey() },
  });
  const modelsParams =
    filterBrandId !== "all" ? { brandId: parseInt(filterBrandId, 10) } : undefined;
  const { data: models, isLoading } = useListTaxonomyModels(modelsParams, {
    query: { queryKey: getListTaxonomyModelsQueryKey(modelsParams) },
  });
  const create = useCreateTaxonomyModel();
  const del = useDeleteTaxonomyModel();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/admin/taxonomy/models"] });
  };

  const add = () => {
    const bid = parseInt(brandId, 10);
    if (Number.isNaN(bid) || !name.trim()) return;
    create.mutate(
      { data: { brandId: bid, name: name.trim() } },
      {
        onSuccess: () => {
          setName("");
          invalidate();
          toast({ title: "Model added" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Add failed",
            description: errMsg(e, "Could not add model"),
          }),
      },
    );
  };
  const remove = (id: number) =>
    del.mutate(
      { id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Model deleted" });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Delete failed",
            description: errMsg(e, "Could not delete model"),
          }),
      },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="rounded-none max-w-[220px]">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            {brands?.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Model alias (e.g. Birkin 30)"
          className="rounded-none max-w-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button
          onClick={add}
          disabled={!brandId || !name.trim() || create.isPending}
          className="rounded-none uppercase tracking-widest text-[10px]"
        >
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Filter
          </span>
          <Select value={filterBrandId} onValueChange={setFilterBrandId}>
            <SelectTrigger className="rounded-none max-w-[200px]">
              <SelectValue placeholder="All brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands?.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-none" />
      ) : !models || models.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No models yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                Brand
              </TableHead>
              <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                Model
              </TableHead>
              <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                Normalized
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <TableRow key={m.id} className="border-border">
                <TableCell className="text-xs">{m.brandName}</TableCell>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {m.normalizedName}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive rounded-none"
                    onClick={() => remove(m.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function SimpleList({
  isLoading,
  rows,
  onDelete,
  empty,
}: {
  isLoading: boolean;
  rows: { id: number; primary: string; secondary: string }[] | undefined;
  onDelete: (id: number) => void;
  empty: string;
}) {
  if (isLoading) return <Skeleton className="h-40 w-full rounded-none" />;
  if (!rows || rows.length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">{empty}</p>;
  return (
    <Table data-testid="taxonomy-list">
      <TableHeader>
        <TableRow>
          <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
            Name
          </TableHead>
          <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
            Details
          </TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} className="border-border">
            <TableCell className="font-medium">{r.primary}</TableCell>
            <TableCell className="text-xs text-muted-foreground font-mono">
              {r.secondary}
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive rounded-none"
                onClick={() => onDelete(r.id)}
                data-testid={`taxonomy-delete-${r.id}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
