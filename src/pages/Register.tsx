
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import RegisterForm from "@/components/RegisterForm";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";

const Register = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Redirect if user is already logged in
  useEffect(() => {
    if (user) {
      navigate("/profile");
    }
  }, [user, navigate]);

  return (
    <div className="flex flex-col min-h-screen">
      <CrowdlyHeader />
      <main className="flex-1 container max-w-screen-xl mx-auto p-4 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-bold text-center mb-8">Join Crowdly</h1>
          <RegisterForm />
        </div>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Register;
