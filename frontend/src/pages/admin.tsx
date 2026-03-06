import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Users, ShieldCheck, Pencil, Activity, Zap, ArrowUpDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { useLocation } from "wouter";

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  isGuest: boolean;
  xp: number;
  level: number;
  streakCount: number;
  createdAt: string | null;
}

interface AdminStats {
  totalUsers: number;
  totalTransactions: number;
  totalXpDistributed: number;
}

export default function Admin() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [newLevel, setNewLevel] = useState("");
  const [editRoleUser, setEditRoleUser] = useState<AdminUser | null>(null);
  const [newRole, setNewRole] = useState("");

  const { data: profile } = useQuery<{ isAdmin?: boolean; role?: string }>({
    queryKey: ["/api/profile"],
  });

  useEffect(() => {
    if (profile && profile.role !== "admin" && !profile.isAdmin) {
      setLocation("/");
    }
  }, [profile, setLocation]);

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: users, isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const setLevelMutation = useMutation({
    mutationFn: (data: { userId: string; level: number }) =>
      apiRequest("PATCH", `/api/admin/users/${data.userId}/level`, { level: data.level }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Level updated successfully" });
      setEditUser(null);
      setNewLevel("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const setRoleMutation = useMutation({
    mutationFn: (data: { userId: string; role: string }) =>
      apiRequest("PATCH", `/api/admin/users/${data.userId}/role`, { role: data.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Role updated successfully" });
      setEditRoleUser(null);
      setNewRole("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (error) {
    return (
      <div className="p-6 text-red-500" data-testid="text-admin-error">
        Error: {(error as Error).message}
      </div>
    );
  }

  if (isLoading || statsLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto pb-2" data-testid="admin-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold" data-testid="text-admin-title">{t.admin.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.admin.subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-0 bg-card/80">
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold font-mono" data-testid="text-stat-users">{stats?.totalUsers ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t.admin.totalUsers}</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-card/80">
          <CardContent className="p-4 text-center">
            <Activity className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
            <p className="text-2xl font-bold font-mono" data-testid="text-stat-transactions">{stats?.totalTransactions ?? 0}</p>
            <p className="text-xs text-muted-foreground">Transactions</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-card/80">
          <CardContent className="p-4 text-center">
            <Zap className="w-5 h-5 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold font-mono" data-testid="text-stat-xp">{stats?.totalXpDistributed ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total XP</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          {t.admin.totalUsers}: {users?.length ?? 0}
        </h2>
        <div className="space-y-2">
          {(!users || users.length === 0) ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold text-foreground">{t.admin.noUsers}</h3>
              </CardContent>
            </Card>
          ) : (
            users.map((u) => (
              <Card key={u.id} className="border-0 bg-card/80" data-testid={`card-user-${u.id}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={u.profileImageUrl || ""} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {u.firstName?.[0] || u.email?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : "—"}
                      </span>
                      {u.role === "admin" && (
                        <Badge variant="default" className="text-[10px]" data-testid={`badge-admin-${u.id}`}>
                          <ShieldCheck className="w-3 h-3 mr-0.5" />
                          Admin
                        </Badge>
                      )}
                      {u.isGuest && (
                        <Badge variant="secondary" className="text-[10px]">Guest</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{u.email || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold font-mono">{t.admin.level} {u.level}</p>
                      <p className="text-xs text-muted-foreground">{t.admin.streak}: {u.streakCount}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditRoleUser(u);
                        setNewRole(u.role);
                      }}
                      data-testid={`button-edit-role-${u.id}`}
                      title="Change role"
                    >
                      <ArrowUpDown className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditUser(u);
                        setNewLevel(String(u.level));
                      }}
                      data-testid={`button-set-level-${u.id}`}
                      title="Set level"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.admin.setLevelTitle}</DialogTitle>
            <DialogDescription>
              {t.admin.setLevelDesc}: {editUser?.firstName || editUser?.email || "User"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t.admin.newLevel}</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value)}
                data-testid="input-new-level"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditUser(null)} data-testid="button-cancel-level">{t.admin.cancel}</Button>
              <Button
                onClick={() => {
                  if (editUser && newLevel) {
                    setLevelMutation.mutate({ userId: editUser.id, level: parseInt(newLevel) });
                  }
                }}
                disabled={setLevelMutation.isPending}
                data-testid="button-save-level"
              >
                {setLevelMutation.isPending ? "..." : t.admin.save}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRoleUser} onOpenChange={(open) => !open && setEditRoleUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              {editRoleUser?.firstName || editRoleUser?.email || "User"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger data-testid="select-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRoleUser(null)} data-testid="button-cancel-role">{t.admin.cancel}</Button>
              <Button
                onClick={() => {
                  if (editRoleUser && newRole) {
                    setRoleMutation.mutate({ userId: editRoleUser.id, role: newRole });
                  }
                }}
                disabled={setRoleMutation.isPending}
                data-testid="button-save-role"
              >
                {setRoleMutation.isPending ? "..." : t.admin.save}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
