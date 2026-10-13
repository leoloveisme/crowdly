import React from "react";
import { Link } from "react-router-dom";
import EditableText from "@/components/EditableText";

const NotFound: React.FC = () => (
  <div className="p-8 text-center">
    <EditableText id="webapp-notfound" as="p" className="mb-2 text-lg">
      There's nothing here.
    </EditableText>
    <Link to="/" className="underline">
      <EditableText id="webapp-notfound-home">Back to the start</EditableText>
    </Link>
  </div>
);
export default NotFound;
