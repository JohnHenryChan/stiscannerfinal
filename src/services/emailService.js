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

export const sendPasswordResetEmail = async (resetData) => {
  const { email, name, resetLink } = resetData;
  
  try {
    console.log(`[EmailService] Sending password reset email to ${email}`);
    
    const templateParams = {
      to_email: email,           // For recipient address
      to_name: name,             // For recipient name
      reset_link: resetLink,     // Password reset link
      from_name: 'STI Scanner Admin Team',
    };

    console.log('[EmailService] Password reset template params:', templateParams);

    const result = await emailjs.send(
      'service_z562n15',         // Your service ID
      'template_wb5koa1', // Your password reset template ID
      templateParams
    );

    console.log('✅ [EmailService] Password reset email sent successfully:', result);
    return { success: true, messageId: result.text };
    
  } catch (error) {
    console.error('🔥 [EmailService] Failed to send password reset email:', error);
    throw new Error(`Password reset email failed: ${error.text || error.message}`);
  }
};