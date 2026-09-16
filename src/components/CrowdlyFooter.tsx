
import React from "react";
import { Link } from "react-router-dom";
import EditableText from "@/components/EditableText";

const CrowdlyFooter = () => {
  return (
    <footer className="relative bg-gradient-to-tr from-indigo-200 via-pink-100 to-white dark:from-indigo-900 dark:via-slate-900 dark:to-pink-900 w-full py-10 px-0 mt-14 border-t border-indigo-100 dark:border-indigo-800/40">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto rounded-3xl bg-white/90 dark:bg-gradient-to-tr dark:from-indigo-900/80 dark:to-pink-900/50 p-8 shadow-xl border border-pink-200/40 dark:border-indigo-800/60">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div>
              <h3 className="font-semibold text-lg text-indigo-800 dark:text-indigo-100 mb-4">
                <EditableText id="footer-company-title" layoutScoped>Company</EditableText>
              </h3>
              <ul className="space-y-2">
                <li><a href="/about-us" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-about" layoutScoped>About Us</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-careers" layoutScoped>Careers</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-press" layoutScoped>Press</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-news" layoutScoped>News</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-blog" layoutScoped>Blog</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-support" layoutScoped>Support</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-terms" layoutScoped>Terms & Conditions</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-privacy" layoutScoped>Privacy</EditableText>
                </a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg text-indigo-800 dark:text-indigo-100 mb-4">
                <EditableText id="footer-navigation-title" layoutScoped>Finding your ways</EditableText>
              </h3>
              <ul className="space-y-2">
                <li><Link to="/sitemap" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-sitemap" layoutScoped>Sitemap</EditableText>
                </Link></li>
              </ul>
              <ul className="space-y-2">
                <li><Link to="/lounge" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-lounge" layoutScoped>Lounge</EditableText>
                </Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg text-indigo-800 dark:text-indigo-100 mb-4">
                <EditableText id="footer-cocreate-title" layoutScoped>C(o-c)reate with us</EditableText>
              </h3>
              <ul className="space-y-2">
                <li><Link to="/software" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-software" layoutScoped>Apps and software</EditableText>
                </Link></li>
                <li><a href="https://github.com/leoloveisme/crowdly" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-github" layoutScoped>Crowdly on Github</EditableText>
                </a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg text-indigo-800 dark:text-indigo-100 mb-4">
                <EditableText id="footer-community-title" layoutScoped>Community</EditableText>
              </h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-contact" layoutScoped>Contact us</EditableText>
                </a></li>
                <li><Link to="/feedback" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-feedback" layoutScoped>Send feedback</EditableText>
                </Link></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-bug" layoutScoped>Submit a bug report</EditableText>
                </a></li>
                <li><a href="/suggest-feature" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-feature" layoutScoped>Suggest a feature</EditableText>
                </a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg text-indigo-800 dark:text-indigo-100 mb-4">
                <EditableText id="footer-social-title" layoutScoped>Find us on</EditableText>
              </h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-facebook" layoutScoped>Facebook</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-instagram" layoutScoped>Instagram</EditableText>
                </a></li>
                <li><a href="https://x.com/CrowdlyE43743" title="Crowdly on X" target="_blank"  className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-twitter" layoutScoped>X</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-discord" layoutScoped>Discord</EditableText>
                </a></li>
                <li><a href="#" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-linkedin" layoutScoped>LinkedIn</EditableText>
                </a></li>
                <li><a href="https://www.youtube.com/@Crowdly.Entertainment" title="Crowdly channel on YouTube" target="_blank" className="text-gray-600 hover:text-pink-600 transition">
                  <EditableText id="footer-youtube" layoutScoped>YouTube</EditableText>
                </a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-indigo-100 dark:border-indigo-800/50 flex flex-col md:flex-row justify-between items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-300">
              © {new Date().getFullYear()} Crowdly. All rights reserved.
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-300">
              <EditableText id="footer-bottom-text" layoutScoped>Built with love and creativity.</EditableText>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default CrowdlyFooter;
