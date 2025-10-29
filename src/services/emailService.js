import emailjs from '@emailjs/browser';

// Initialize EmailJS with your public key
emailjs.init("xJC92mOgm4DEERlnw"); // Replace with your actual public key from EmailJS

export const sendWelcomeEmail = async (userData) => {
  const { email, name, password } = userData;
  
  try {
    console.log(`[EmailService] Sending welcome email to ${email}`);
    
    const templateParams = {
      to_email: email,           // For recipient address
      to_name: name,             // For recipient name
      user_email: email,         // For template content
      temp_password: password,   // For template content
      from_name: 'STI Scanner Admin Team',
    };

    console.log('[EmailService] Template params:', templateParams);

    const result = await emailjs.send(
      'service_z562n15',    // Your service ID
      'template_4vo4l3q',   // Your template ID
      templateParams
    );

    console.log('✅ [EmailService] Email sent successfully:', result);
    return { success: true, messageId: result.text };
    
  } catch (error) {
    console.error('🔥 [EmailService] Failed to send email:', error);
    throw new Error(`Email sending failed: ${error.text || error.message}`);
  }
};