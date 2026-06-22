import React from "react";
import IconButton from "../local-ui/IconButton";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

const ContactFormSection = () => {
  return (
    <div className=" py-24">
      <p className="font-light text-5xl tracking-tighter">
        Let’s get your music heard.
      </p>
      <p className="text-muted-foreground text-lg mt-3 font-light">
        Artist, visionary, or just someone with big ideas? We’re here to listen.
        Let’s talk.
      </p>
      <form className="mt-14 space-y-5 max-w-[360px]">
        <Input
          type="text"
          placeholder="Enter your name"
          className="placeholder:font-light rounded-full !py-5"
        />

        <Input
          type="email"
          placeholder="Eenter your email"
          className="placeholder:font-light rounded-full !py-5"
        />

        <Textarea
          placeholder="Enter your message"
          className="placeholder:font-light min-h-[120px] max-h-[200px] resize-none no-scrollbar rounded-3xl !py-5"
          rows={5}
        />
      </form>
      <IconButton text="Get In Touch" className="w-fit mt-10" />
    </div>
  );
};

export default ContactFormSection;
