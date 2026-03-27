import { AppLayout } from "@/components/layout/app-layout";
import { useListUsers, useCreateUser, useDeleteUser, useUpdateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useAppStore } from "@/store";
import { getTranslation } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Shield, User as UserIcon, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function makePasswordSchema(t: (k: any) => string) {
  return z
    .string()
    .min(6, t('password_too_short'))
    .refine((v) => /[A-Z]/.test(v), t('password_no_upper'))
    .refine((v) => /[a-z]/.test(v), t('password_no_lower'))
    .refine((v) => /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(v), t('password_no_digit'));
}

export default function Users() {
  const { data: users, isLoading } = useListUsers();
  const { language, user: currentUser } = useAppStore();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: number; username: string; email?: string | null; role: string } | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const passwordSchema = makePasswordSchema(t);

  const createSchema = z.object({
    username: z.string().min(3),
    email: z.string().email().optional().or(z.literal("")),
    password: passwordSchema,
    role: z.enum(["admin", "employee"]),
  });

  const editSchema = z.object({
    username: z.string().min(3),
    email: z.string().email().optional().or(z.literal("")),
    password: z.string().optional().refine((v) => {
      if (!v || v.length === 0) return true;
      return passwordSchema.safeParse(v).success;
    }, { message: t('password_too_short') }),
    role: z.enum(["admin", "employee"]),
  });

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setIsCreateOpen(false);
        createForm.reset();
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
    defaultValues: { username: "", email: "", password: "", role: "employee" }
  });

  const editForm = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: { username: "", email: "", password: "", role: "employee" }
  });

  function openEdit(u: { id: number; username: string; email?: string | null; role: string }) {
    setEditingUser(u);
    editForm.reset({ username: u.username, email: u.email ?? "", password: "", role: u.role as any });
  }

  function onEditSubmit(values: z.infer<typeof editSchema>) {
    if (!editingUser) return;
    const payload: any = { username: values.username, email: values.email || null, role: values.role };
    if (values.password && values.password.length > 0) payload.password = values.password;
    updateMutation.mutate({ id: editingUser.id, data: payload });
  }

  if (currentUser?.role !== 'admin') {
    return <AppLayout><div className="p-8 text-center text-destructive font-bold text-xl">{t('access_denied')}</div></AppLayout>;
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
            <DialogContent className="glass-card sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t('user_add_new')}</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit((v) => createMutation.mutate({ data: v as any }))} className="space-y-4 pt-4">
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
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>{t('save')}</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
          <DialogContent className="glass-card sm:max-w-[425px]">
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
                  <TableHead className="w-[250px]">{t('user_username')}</TableHead>
                  <TableHead>{t('user_role')}</TableHead>
                  <TableHead>{t('created_at')}</TableHead>
                  <TableHead className="text-end">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">{t('loading')}</TableCell></TableRow>
                ) : users?.map(u => (
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
                    <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full"
                          onClick={() => openEdit(u as any)}
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
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
