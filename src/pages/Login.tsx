
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import LoginForm from "@/components/LoginForm";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";

const Login = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Redirect if user is already logged in
  useEffect(() => {
    if (user) {
      navigate("/profile");
    }
  }, [user, navigate]);

  const handleClose = () => {
    navigate("/");
  };

  return (
    <div className="flex flex-col min-h-screen">
      <CrowdlyHeader />
      <main className="flex-1 container max-w-screen-xl mx-auto p-4 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-bold text-center mb-8">Welcome Back</h1>
          <LoginForm onClose={handleClose} />
        </div>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Login;
