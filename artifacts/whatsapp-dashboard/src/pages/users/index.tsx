import { AppLayout } from "@/components/layout/app-layout";
import { useListUsers, useCreateUser, useDeleteUser, useUpdateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Shield, User as UserIcon, Pencil, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

// All granular permission keys
const PERMISSION_KEYS = [
  "sendText", "sendImage", "sendVideo", "sendAudio",
  "sendFile", "sendLocation", "sendSticker",
  "createSession", "deleteSession", "viewMessages", "manageWebhook",
] as const;
type PermKey = typeof PERMISSION_KEYS[number];

/** Parse a permissions JSON string into a record */
function parsePerms(json: string | null | undefined): Record<PermKey, boolean> {
  const defaults = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Record<PermKey, boolean>;
  if (!json) return defaults;
  try {
    const parsed = JSON.parse(json);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

/** Convert a permissions record to JSON (only store if any key is explicitly false) */
function serializePerms(perms: Record<PermKey, boolean>): Record<PermKey, boolean> | null {
  const hasRestriction = PERMISSION_KEYS.some((k) => perms[k] === false);
  if (!hasRestriction) return null; // no restrictions → null (all allowed)
  return perms;
}

function makePasswordSchema(t: (k: any) => string) {
  return z
    .string()
    .min(6, t('password_too_short'))
    .refine((v) => /[A-Z]/.test(v), t('password_no_upper'))
    .refine((v) => /[a-z]/.test(v), t('password_no_lower'))
    .refine((v) => /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(v), t('password_no_digit'));
}

type UserRow = {
  id: number;
  username: string;
  email?: string | null;
  role: string;
  permissions?: string | null;
  maxSessions?: number | null;
};

export default function Users() {
  const { data: users, isLoading } = useListUsers();
  const { language, user: currentUser } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const passwordSchema = makePasswordSchema(t);

  // Permissions state for create
  const [createPerms, setCreatePerms] = useState<Record<PermKey, boolean>>(
    Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Record<PermKey, boolean>
  );
  // Permissions state for edit
  const [editPerms, setEditPerms] = useState<Record<PermKey, boolean>>(
    Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Record<PermKey, boolean>
  );

  const createSchema = z.object({
    username: z.string().min(3),
    email: z.string().email().optional().or(z.literal("")),
    password: passwordSchema,
    role: z.enum(["admin", "employee"]),
    maxSessions: z.string().optional(),
  });

  const editSchema = z.object({
    username: z.string().min(3),
    email: z.string().email().optional().or(z.literal("")),
    password: z.string().optional().refine((v) => {
      if (!v || v.length === 0) return true;
      return passwordSchema.safeParse(v).success;
    }, { message: t('password_too_short') }),
    role: z.enum(["admin", "employee"]),
    maxSessions: z.string().optional(),
  });

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setIsCreateOpen(false);
        createForm.reset();
        setCreatePerms(Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as any);
        toast({ title: t('success') });
      },
      onError: (e: any) => toast({ variant: "destructive", title: t('error'), description: e?.response?.data?.error || t('user_create_error') })
    }
  });

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setEditingUser(null);
        toast({ title: t('success') });
      },
      onError: (e: any) => toast({ variant: "destructive", title: t('error'), description: e?.response?.data?.error || t('user_update_error') })
    }
  });

  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setDeletingUserId(null);
      }
    }
  });

  const createForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { username: "", email: "", password: "", role: "employee", maxSessions: "" }
  });

  const editForm = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: { username: "", email: "", password: "", role: "employee", maxSessions: "" }
  });

  function openEdit(u: UserRow) {
    setEditingUser(u);
    editForm.reset({
      username: u.username,
      email: u.email ?? "",
      password: "",
      role: u.role as any,
      maxSessions: u.maxSessions != null ? String(u.maxSessions) : "",
    });
    setEditPerms(parsePerms(u.permissions));
  }

  function onCreateSubmit(values: z.infer<typeof createSchema>) {
    const permissions = serializePerms(createPerms);
    const maxSessions = values.maxSessions && values.maxSessions !== "" ? parseInt(values.maxSessions, 10) : null;
    createMutation.mutate({ data: { ...values, permissions, maxSessions } as any });
  }

  function onEditSubmit(values: z.infer<typeof editSchema>) {
    if (!editingUser) return;
    const permissions = serializePerms(editPerms);
    const maxSessions = values.maxSessions && values.maxSessions !== "" ? parseInt(values.maxSessions, 10) : null;
    const payload: any = { username: values.username, email: values.email || null, role: values.role, permissions, maxSessions };
    if (values.password && values.password.length > 0) payload.password = values.password;
    updateMutation.mutate({ id: editingUser.id, data: payload });
  }

  const isEmployee = (role: string) => role === "employee";

  if (currentUser?.role !== 'admin') {
    return <AppLayout><div className="p-8 text-center text-destructive font-bold text-xl">{t('access_denied')}</div></AppLayout>;
  }

  function PermissionsSection({
    perms,
    onChange,
    role,
  }: {
    perms: Record<PermKey, boolean>;
    onChange: (p: Record<PermKey, boolean>) => void;
    role: string;
  }) {
    if (role !== "employee") return null;
    return (
      <div className="space-y-3">
        <Separator />
        <div>
          <p className="text-sm font-semibold">{t('user_permissions_title')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('user_permissions_hint')}</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {PERMISSION_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer hover:text-foreground text-sm">
              <Checkbox
                checked={perms[key]}
                onCheckedChange={(checked) => onChange({ ...perms, [key]: !!checked })}
              />
              <span className={!perms[key] ? "line-through text-muted-foreground" : ""}>
                {t(`user_perm_${key}` as any)}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('nav_users')}</h1>
            <p className="text-muted-foreground mt-1">{t('user_subtitle')}</p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="font-semibold shadow-lg shadow-primary/20 hover-elevate">
                <Plus className="w-4 h-4 me-2" />
                {t('user_add_new')}
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('user_add_new')}</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4 pt-4">
                  <FormField control={createForm.control} name="username" render={({ field }) => (
                    <FormItem><FormLabel>{t('user_username')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={createForm.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>{t('user_email')}</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={createForm.control} name="password" render={({ field }) => (
                    <FormItem><FormLabel>{t('user_password')}</FormLabel><FormControl><Input {...field} type="password" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={createForm.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('user_role')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="admin">{t('user_admin')}</SelectItem>
                          <SelectItem value="employee">{t('user_employee')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {createForm.watch("role") === "employee" && (
                    <FormField control={createForm.control} name="maxSessions" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('user_max_sessions')}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={1}
                            placeholder={t('unlimited')}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">{t('user_max_sessions_hint')}</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  <PermissionsSection
                    perms={createPerms}
                    onChange={setCreatePerms}
                    role={createForm.watch("role")}
                  />

                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>{t('save')}</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
          <DialogContent className="glass-card sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('user_edit_title')}</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
                <FormField control={editForm.control} name="username" render={({ field }) => (
                  <FormItem><FormLabel>{t('user_username')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{t('user_email')}</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="password" render={({ field }) => (
                  <FormItem><FormLabel>{t('user_new_password')}</FormLabel><FormControl><Input {...field} type="password" autoComplete="new-password" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('user_role')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="admin">{t('user_admin')}</SelectItem>
                        <SelectItem value="employee">{t('user_employee')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {editForm.watch("role") === "employee" && (
                  <FormField control={editForm.control} name="maxSessions" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('user_max_sessions')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={1}
                          placeholder={t('unlimited')}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">{t('user_max_sessions_hint')}</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <PermissionsSection
                  perms={editPerms}
                  onChange={setEditPerms}
                  role={editForm.watch("role")}
                />

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingUser(null)}>{t('cancel')}</Button>
                  <Button type="submit" className="flex-1" disabled={updateMutation.isPending}>{t('save')}</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deletingUserId !== null} onOpenChange={(open) => { if (!open) setDeletingUserId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('are_you_sure')}</AlertDialogTitle>
              <AlertDialogDescription>{t('user_delete_confirm')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={() => { if (deletingUserId !== null) deleteMutation.mutate({ id: deletingUserId }); }}
              >
                {t('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Card className="glass-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[220px]">{t('user_username')}</TableHead>
                  <TableHead>{t('user_role')}</TableHead>
                  <TableHead>{t('user_sessions_count')}</TableHead>
                  <TableHead>{t('user_permissions_title')}</TableHead>
                  <TableHead>{t('created_at')}</TableHead>
                  <TableHead className="text-end">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">{t('loading')}</TableCell></TableRow>
                ) : (users as UserRow[] | undefined)?.map(u => {
                  const perms = u.permissions ? (() => { try { return JSON.parse(u.permissions!); } catch { return null; } })() : null;
                  const hasRestrictions = perms && Object.values(perms).some((v) => v === false);
                  return (
                    <TableRow key={u.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                            <UserIcon className="w-4 h-4 text-secondary-foreground" />
                          </div>
                          <div>
                            {u.username}
                            {u.email && <div className="text-xs text-muted-foreground font-normal">{u.email}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' && <Shield className="w-3 h-3 me-1"/>}
                          {t(u.role === 'admin' ? 'user_admin' : 'user_employee')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {isEmployee(u.role) ? (
                          u.maxSessions != null
                            ? <span className="font-medium text-foreground">{u.maxSessions}</span>
                            : <span className="text-xs">{t('unlimited')}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEmployee(u.role) ? (
                          hasRestrictions
                            ? <Badge variant="outline" className="text-xs gap-1"><Lock className="w-3 h-3" />{t('restrict')}</Badge>
                            : <span className="text-xs text-muted-foreground">{t('unlimited')}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{new Date(u.createdAt ?? Date.now()).toLocaleDateString()}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                            onClick={() => openEdit(u)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                            onClick={() => setDeletingUserId(u.id)}
                            disabled={deleteMutation.isPending || u.id === currentUser?.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
