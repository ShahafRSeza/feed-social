import { use } from "react";
import UserProfileClient from "./UserProfileClient";

export default function UserProfilePage({ params }) {
  const { username } = use(params); // params הוא Promise ב-Next 16
  return <UserProfileClient username={username} />;
}