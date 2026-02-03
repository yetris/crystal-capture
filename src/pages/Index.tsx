import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Camera, 
  Video, 
  Crop, 
  Clock, 
  Download, 
  Sparkles, 
  Check,
  ChevronRight,
  Monitor,
  Keyboard,
  Zap,
  Shield
} from "lucide-react";

const Index = () => {
  const features = [
    {
      icon: Camera,
      title: "Full Page Capture",
      description: "Automatically scroll and stitch entire web pages into one seamless screenshot"
    },
    {
      icon: Monitor,
      title: "Visible Area",
      description: "Instant capture of your current viewport with one click"
    },
    {
      icon: Crop,
      title: "Region Selection",
      description: "Draw a box to capture exactly what you need"
    },
    {
      icon: Video,
      title: "Tab Recording",
      description: "Record your tab with audio using MediaRecorder API"
    },
    {
      icon: Clock,
      title: "Scheduling",
      description: "Set up automated recurring captures at custom intervals"
    },
    {
      icon: Keyboard,
      title: "Shortcuts",
      description: "Ctrl+Shift+S for full page, Ctrl+Shift+V for visible area"
    }
  ];

  const pricingFeatures = [
    "Unlimited screenshots",
    "Full page capture",
    "Region selection",
    "Tab video recording",
    "Scheduled captures",
    "HD video export",
    "Priority support"
  ];

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Gradient background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-secondary/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg animate-glow">
            <Camera className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">
            GenAI<span className="gradient-text">ScreenShots</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
            Features
          </Button>
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Button>
          <Button className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity">
            <Download className="w-4 h-4 mr-2" />
            Install Free
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-6 pt-20 pb-32 max-w-7xl mx-auto text-center">
        <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm bg-primary/10 border border-primary/20 text-primary">
          <Sparkles className="w-3 h-3 mr-1" />
          Chrome Extension • Manifest V3
        </Badge>
        
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight animate-fade-up">
          Capture Everything.
          <br />
          <span className="gradient-text">Beautifully.</span>
        </h1>
        
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          The most powerful screenshot and screen recording extension for Chrome. 
          Full page captures, region selection, video recording, and scheduled automation.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <Button size="lg" className="text-lg px-8 py-6 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all hover:scale-105 shadow-lg animate-glow">
            <Download className="w-5 h-5 mr-2" />
            Add to Chrome — Free
          </Button>
          <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-border/50 hover:bg-card">
            View Demo
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        </div>

        {/* Extension Preview */}
        <div className="mt-20 relative animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
          <div className="glass-panel rounded-2xl p-1 max-w-md mx-auto animate-float shadow-2xl">
            <div className="bg-card rounded-xl overflow-hidden">
              {/* Mock browser bar */}
              <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 border-b border-border/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                </div>
                <div className="flex-1 text-center text-xs text-muted-foreground font-mono">
                  chrome-extension://screenshots
                </div>
              </div>
              {/* Extension UI Mock */}
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary" />
                    <div>
                      <div className="text-sm font-semibold">GenAIScreenShots</div>
                      <div className="text-xs text-muted-foreground">Capture • Record • Share</div>
                    </div>
                  </div>
                  <Badge className="bg-warning/20 text-warning border-warning/30">PRO</Badge>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {['Visible', 'Full Page', 'Region', 'Record'].map((label, i) => (
                    <div key={label} className="glass-panel rounded-lg p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="w-6 h-6 mx-auto mb-1 rounded bg-primary/20 flex items-center justify-center">
                        {i === 3 ? (
                          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        ) : (
                          <Camera className="w-3 h-3 text-primary" />
                        )}
                      </div>
                      <div className="text-[10px] font-medium">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 bg-secondary/10 border-secondary/20 text-secondary">
            Features
          </Badge>
          <h2 className="text-4xl font-bold mb-4">Everything You Need</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Professional-grade capture tools with an intuitive interface
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={feature.title} 
              className="glass-panel border-0 p-6 hover:bg-muted/30 transition-all duration-300 group cursor-pointer animate-fade-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative z-10 px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 bg-primary/10 border-primary/20 text-primary">
            Pricing
          </Badge>
          <h2 className="text-4xl font-bold mb-4">Simple, Fair Pricing</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Start free, upgrade when you need more power
          </p>
        </div>

        <div className="max-w-lg mx-auto">
          <Card className="glass-panel border-0 p-8 relative overflow-hidden animate-glow">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/30 to-secondary/30 rounded-full blur-3xl" />
            
            <div className="relative">
              <Badge className="bg-gradient-to-r from-primary to-secondary text-primary-foreground mb-4">
                Most Popular
              </Badge>
              
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-5xl font-bold">$5</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              
              <p className="text-muted-foreground mb-8">
                Unlock all premium features with our simple monthly plan
              </p>
              
              <ul className="space-y-3 mb-8">
                {pricingFeatures.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <Button className="w-full py-6 text-lg bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity">
                Get Started
                <Zap className="w-4 h-4 ml-2" />
              </Button>
              
              <p className="text-center text-xs text-muted-foreground mt-4 flex items-center justify-center gap-2">
                <Shield className="w-3 h-3" />
                Secure payment via ExtensionPay
              </p>
            </div>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-6 py-24 max-w-7xl mx-auto text-center">
        <div className="glass-panel rounded-3xl p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[100px]" />
          
          <div className="relative">
            <h2 className="text-4xl font-bold mb-4">Ready to Capture?</h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-8">
              Join thousands of users who trust GenAIScreenShots for their capture needs
            </p>
            <Button size="lg" className="text-lg px-10 py-6 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all hover:scale-105">
              <Download className="w-5 h-5 mr-2" />
              Install Now — It's Free
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-8 border-t border-border/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Camera className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">GenAIScreenShots</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 GenAIScreenShots. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
