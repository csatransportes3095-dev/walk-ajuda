import { useLocation } from "wouter";
import AdminEmailGenerator from "@/components/AdminEmailGenerator";

export default function AdminEmailGeneratorPage() {
  const [, navigate] = useLocation();
  return <AdminEmailGenerator onBack={() => navigate("/admin/codes")} />;
}
